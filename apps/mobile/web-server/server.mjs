// Servidor da versão web (o build de `expo export -p web`), sem dependências.
//
//   node web-server/server.mjs [pasta=dist] [--port 8088]
//   node web-server/server.mjs --write-pages <pasta>   (só grava as páginas de erro em HTML)
//
// Segurança:
// - Nada de mapa do app: /_sitemap, sitemap*.xml, robots.txt, metadata.json, source maps (.map),
//   arquivos internos do expo-router ("+not-found", "(tabs)") e arquivos com ponto (.env, .git)
//   respondem 404, igual a um endereço que não existe (sem dizer que estão bloqueados).
// - Só serve o que está dentro da pasta do build (sem "..", sem barra invertida, sem byte nulo).
// - Só GET e HEAD (o resto: 405).
// - Limite de pedidos por IP (429 com Retry-After).
// - Manutenção: MANUTENCAO=1 responde 503 em tudo.
// - Cabeçalhos de segurança em toda resposta (veja docs/SEGURANCA.md).
// - Erro inesperado: 500, sem detalhe técnico para quem vê.
//
// Variáveis: PORT, MANUTENCAO=1, WEB_RATE_LIMIT (pedidos por minuto por IP, padrão 600),
// TRUST_PROXY=1 (o IP vem do X-Forwarded-For de um proxy na frente), WEB_HSTS=1 (site em HTTPS).

import { createReadStream, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorPage, ERROR_PAGES } from './error-pages.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/** Cabeçalhos de segurança de toda resposta. */
export function securityHeaders({ hsts = false } = {}) {
  return {
    'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(hsts ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

/**
 * Endereços que nunca são servidos (respondem 404): tudo que mostra o mapa do app ou arquivos
 * internos do build. `_expo/` fica liberado (são os scripts e as fontes do app).
 */
export function isHidden(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const last = (segments.at(-1) ?? '').toLowerCase();
  // Arquivos do build (scripts e imagens): os nomes têm "_" e "+" de verdade (__common-….js,
  // _layout-….js, __node_modules); aqui só ficam de fora os arquivos com ponto e os source maps.
  if (segments[0] === '_expo' || segments[0] === 'assets') return segments.some((s) => s.startsWith('.')) || last.endsWith('.map');
  for (const s of segments) {
    if (s.startsWith('.')) return true; // .env, .git, .well-known...
    if (s.startsWith('_') && s !== '_expo') return true; // _sitemap, __anything
    if (/[+()]/.test(s)) return true; // +not-found, +html, (tabs)
  }
  if (/^sitemap.*$/.test(last) || /^robots\.txt$/.test(last)) return true;
  if (last.endsWith('.map')) return true; // source maps (código-fonte)
  if (segments.length === 1 && last.endsWith('.json')) return true; // metadata.json, manifest...
  if (last.endsWith('.html')) return true; // só endereços limpos (/admin, não /admin.html)
  return false;
}

/** As rotas do app a partir dos .html do build: /u/[username] vira /^\/u\/[^/]+$/. */
export function buildRoutes(root) {
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_expo' || entry.name === 'assets') continue;
        walk(full);
      } else if (entry.name.endsWith('.html')) {
        const rel = relative(root, full)
          .split(sep)
          .join('/')
          .replace(/\.html$/, '');
        const segs = rel.split('/');
        // Arquivos internos (+not-found, _sitemap, grupos como (tabs)) não viram rota.
        if (segs.some((s) => s.startsWith('+') || s.startsWith('_') || s.startsWith('('))) continue;
        if (segs.at(-1) === 'index') segs.pop();
        let dynamic = 0;
        const pattern = segs
          .map((s) => {
            if (/^\[\.\.\.[^\]]+\]$/.test(s)) return ((dynamic += 10), '.+');
            if (/^\[[^\]]+\]$/.test(s)) return ((dynamic += 1), '[^/]+');
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/');
        routes.push({ re: new RegExp(`^/${pattern}/?$`), file: full, dynamic });
      }
    }
  };
  walk(root);
  // Endereço fixo antes do dinâmico (/settings/account antes de /settings/[x]).
  return routes.sort((a, b) => a.dynamic - b.dynamic);
}

/** Limite simples por IP: N pedidos por minuto (janela fixa). */
function rateLimiter(perMinute) {
  const hits = new Map();
  let windowStart = Date.now();
  return (ip) => {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      hits.clear();
      windowStart = now;
    }
    const n = (hits.get(ip) ?? 0) + 1;
    hits.set(ip, n);
    return n > perMinute ? Math.ceil((60_000 - (now - windowStart)) / 1000) : 0;
  };
}

export function createWebServer({
  root,
  maintenance = process.env.MANUTENCAO === '1',
  perMinute = Number(process.env.WEB_RATE_LIMIT) || 600,
  trustProxy = process.env.TRUST_PROXY === '1',
  hsts = process.env.WEB_HSTS === '1',
} = {}) {
  const base = resolve(root);
  const routes = buildRoutes(base);
  const limit = rateLimiter(perMinute);
  const headers = securityHeaders({ hsts });

  const sendError = (req, res, status, extra = {}) => {
    const html = errorPage(status);
    res.writeHead(status, { ...headers, 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(html), ...extra });
    res.end(req.method === 'HEAD' ? undefined : html);
  };

  const sendFile = (req, res, file, size, cache) => {
    res.writeHead(200, {
      ...headers,
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': cache,
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };

  return createServer((req, res) => {
    try {
      if (maintenance) return sendError(req, res, 503, { 'Retry-After': '300' });

      const ip =
        (trustProxy &&
          String(req.headers['x-forwarded-for'] ?? '')
            .split(',')[0]
            .trim()) ||
        req.socket.remoteAddress ||
        '?';
      const wait = limit(ip);
      if (wait) return sendError(req, res, 429, { 'Retry-After': String(wait) });

      if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(req, res, 405, { Allow: 'GET, HEAD' });

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      } catch {
        return sendError(req, res, 404);
      }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..') || isHidden(pathname)) return sendError(req, res, 404);

      // Arquivo do build (scripts, fontes, imagens).
      const file = resolve(base, `.${pathname}`);
      if (file.startsWith(base + sep) && extname(file)) {
        let st = null;
        try {
          st = statSync(file);
        } catch {
          st = null;
        }
        if (st?.isFile()) {
          const immutable = pathname.startsWith('/_expo/static/') || pathname.startsWith('/assets/');
          return sendFile(req, res, file, st.size, immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
        }
        // Sem arquivo: pode ser uma tela com ponto no endereço (/u/ana.silva); segue para as rotas.
      }

      // Tela do app. Arquivo que não existe dentro de _expo/assets é 404 direto.
      if (pathname.startsWith('/_expo/') || pathname.startsWith('/assets/')) return sendError(req, res, 404);
      const route = routes.find((r) => r.re.test(pathname));
      if (route) return sendFile(req, res, route.file, statSync(route.file).size, 'no-cache');
      return sendError(req, res, 404);
    } catch {
      if (!res.headersSent) return sendError(req, res, 500);
      res.destroy();
    }
  });
}

// ---------------------------------------------------------------- linha de comando

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const pagesAt = args.indexOf('--write-pages');
  if (pagesAt >= 0) {
    const dir = resolve(args[pagesAt + 1] ?? 'error-pages');
    mkdirSync(dir, { recursive: true });
    for (const code of Object.keys(ERROR_PAGES)) writeFileSync(join(dir, `${code}.html`), errorPage(Number(code)));
    console.log(`Páginas de erro em ${dir}`);
  } else {
    const portAt = args.indexOf('--port');
    const port = Number(portAt >= 0 ? args[portAt + 1] : process.env.PORT) || 8088;
    const root = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') ?? 'dist';
    createWebServer({ root }).listen(port, () => console.log(`Soundhora web: http://localhost:${port}`));
  }
}
