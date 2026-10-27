// Testes do servidor da web: node --test web-server/
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createWebServer, isHidden } from './server.mjs';

/** Um build de mentira com as mesmas pastas e nomes que o expo export gera. */
function fakeBuild() {
  const root = mkdtempSync(join(tmpdir(), 'web-'));
  const files = {
    'index.html': '<p>home</p>',
    'admin.html': '<p>admin</p>',
    'sign-in.html': '<p>entrar</p>',
    '_sitemap.html': '<p>mapa</p>',
    '+not-found.html': '<p>nf</p>',
    '(tabs)/me.html': '<p>me</p>',
    'u/[username].html': '<p>perfil</p>',
    'settings/index.html': '<p>config</p>',
    'settings/account.html': '<p>conta</p>',
    'erro/[code].html': '<p>erro</p>',
    'metadata.json': '{}',
    'favicon.ico': 'ico',
    '_expo/static/js/web/__common-abc.js': 'js',
    '_expo/static/js/web/_layout-abc.js': 'js',
    '_expo/static/js/web/[username]-abc.js': 'js',
    '_expo/static/js/web/__common-abc.js.map': 'map',
    'assets/__node_modules/expo-router/assets/x.png': 'png',
  };
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), body);
  }
  return root;
}

function start(options) {
  const server = createWebServer(options);
  return new Promise((ok) => server.listen(0, () => ok({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

describe('servidor da web', () => {
  let s;
  const root = fakeBuild();
  before(async () => (s = await start({ root, perMinute: 1000 })));
  after(() => s.server.close());
  const get = (path, init) => fetch(s.url + path, init);

  it('serve as telas, com ponto no @ e rotas fixas antes das dinâmicas', async () => {
    for (const [path, body] of [
      ['/', 'home'],
      ['/admin', 'admin'],
      ['/u/ana.silva', 'perfil'],
      ['/settings', 'config'],
      ['/settings/account', 'conta'],
      ['/erro/503', 'erro'],
    ]) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
      assert.match(await r.text(), new RegExp(body));
    }
  });

  it('serve os scripts e imagens do build (nomes com _ e [])', async () => {
    for (const path of [
      '/_expo/static/js/web/__common-abc.js',
      '/_expo/static/js/web/_layout-abc.js',
      '/_expo/static/js/web/[username]-abc.js',
      '/assets/__node_modules/expo-router/assets/x.png',
      '/favicon.ico',
    ]) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
    }
    const js = await get('/_expo/static/js/web/__common-abc.js');
    assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(js.headers.get('cache-control'), /immutable/);
  });

  it('mapa do app e arquivos internos: 404 igual a endereço que não existe', async () => {
    for (const path of [
      '/_sitemap',
      '/_sitemap.html',
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/robots.txt',
      '/metadata.json',
      '/+not-found',
      '/(tabs)/me',
      '/admin.html',
      '/.env',
      '/.git/config',
      '/_expo/static/js/web/__common-abc.js.map',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/..%2f..%2fetc%2fpasswd',
      '/a%00b',
      '/_expo/nada.js',
      '/nao-existe',
    ]) {
      const r = await get(path);
      assert.equal(r.status, 404, path);
      const html = await r.text();
      assert.match(html, /Página não encontrada/, path);
      assert.doesNotMatch(html, /mapa|nf|etc\/passwd/, path);
    }
  });

  it('só GET e HEAD', async () => {
    const r = await get('/', { method: 'POST', body: 'x' });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'GET, HEAD');
    assert.equal((await get('/', { method: 'HEAD' })).status, 200);
  });

  it('cabeçalhos de segurança em toda resposta', async () => {
    for (const path of ['/', '/robots.txt']) {
      const h = (await get(path)).headers;
      assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(h.get('x-frame-options'), 'DENY');
      assert.equal(h.get('x-content-type-options'), 'nosniff');
      assert.equal(h.get('x-powered-by'), null);
    }
  });
});

describe('limites e manutenção', () => {
  it('429 depois do limite por IP, com Retry-After', async () => {
    const s = await start({ root: fakeBuild(), perMinute: 3 });
    try {
      for (let i = 0; i < 3; i++) assert.equal((await fetch(s.url + '/')).status, 200);
      const r = await fetch(s.url + '/');
      assert.equal(r.status, 429);
      assert.ok(Number(r.headers.get('retry-after')) > 0);
      assert.match(await r.text(), /Muitas tentativas/);
    } finally {
      s.server.close();
    }
  });

  it('manutenção: 503 em tudo', async () => {
    const s = await start({ root: fakeBuild(), maintenance: true });
    try {
      const r = await fetch(s.url + '/admin');
      assert.equal(r.status, 503);
      assert.match(await r.text(), /manutenção/);
    } finally {
      s.server.close();
    }
  });
});

describe('isHidden', () => {
  it('esconde mapas e internos; deixa telas e build', () => {
    assert.equal(isHidden('/_sitemap'), true);
    assert.equal(isHidden('/docs/sitemap.xml'), true);
    assert.equal(isHidden('/u/ana'), false);
    assert.equal(isHidden('/_expo/static/js/web/_sitemap-abc.js'), false);
  });
});
