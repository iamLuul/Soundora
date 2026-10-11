// Lógica da Edge Function link-preview, separada do Deno.serve para poder ser testada
// com Supabase e plataformas simulados (handler.test.ts).
import { extractFirstUrl, parseStreamingUrl } from '../_shared/links/platforms.ts';
import { readJsonLimited } from '../_shared/body.ts';
import { buildLinkPreview, LinkPreviewError, type FetchLike, type LinkPreview } from '../_shared/links/preview.ts';

export const CACHE_DAYS = 7;
export const MAX_BODY_BYTES = 8 * 1024;
/** Prévias por pessoa: 30 por minuto e 500 por dia (cada uma pode buscar nas plataformas). */
export const PREVIEW_RATE = [
  { max: 30, windowSeconds: 60 },
  { max: 500, windowSeconds: 86_400 },
];

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface PreviewRow {
  id: string;
  url: string;
  platform: string;
  kind: string;
  provider_id: string | null;
  title: string;
  artist: string | null;
  image_url: string | null;
  fetched_at: string;
  /** Gêneros do Soundora detectados nas lojas (null = ainda não procurou). */
  genres: string[] | null;
}

/** O que o handler precisa do mundo externo. Em produção vem do Supabase; nos testes, de fakes. */
export interface Deps {
  /** Devolve o id da pessoa logada a partir do header Authorization, ou null. */
  getUserId(authHeader: string): Promise<string | null>;
  findPreview(url: string): Promise<PreviewRow | null>;
  savePreview(preview: LinkPreview, genres: string[] | null): Promise<PreviewRow>;
  /** Gêneros da música pelos metadados das lojas (Apple/Deezer). Opcional: sem ele, não detecta. */
  detectGenres?(title: string, artist: string | null): Promise<string[]>;
  /** Grava os gêneros num cartão que já existia (veio do cache sem eles). */
  saveGenres?(id: string, genres: string[]): Promise<void>;
  /** true = dentro do limite de pedidos da pessoa. */
  rateLimit?(userId: string): Promise<boolean>;
  /** fetch usado para ler as plataformas de música. */
  fetch: FetchLike;
  /** Inclui o motivo técnico do erro na resposta (só em desenvolvimento). */
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const STATUS: Record<string, number> = { unsupported: 422, blocked_host: 422, not_found: 404, fetch_failed: 502 };

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object') return JSON.stringify(err);
  return String(err);
}

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;

  /** Gêneros detectados, ou null se a busca falhou de vez. */
  const detect = async (title: string, artist: string | null): Promise<string[] | null> => {
    if (!deps.detectGenres) return null;
    try {
      return await deps.detectGenres(title, artist);
    } catch (err) {
      log('link-preview: gêneros indisponíveis', err);
      return null;
    }
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let userId: string | null;
    try {
      userId = await deps.getUserId(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('link-preview: falha ao validar o usuário', err);
      return json({ error: 'not_authenticated', ...(deps.debug ? { detail: describe(err) } : {}) }, 401);
    }
    if (!userId) return json({ error: 'not_authenticated' }, 401);

    try {
      if (deps.rateLimit && !(await deps.rateLimit(userId))) {
        await req.body?.cancel().catch(() => {});
        return json({ error: 'rate_limited' }, 429);
      }
    } catch (err) {
      log('link-preview: falha no limite de pedidos', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }

    const read = await readJsonLimited(req, MAX_BODY_BYTES);
    if (!read.ok) return json({ error: read.error }, read.error === 'payload_too_large' ? 413 : 400);
    const body = read.value as { url?: unknown } | null;
    const input = typeof body?.url === 'string' ? extractFirstUrl(body.url.slice(0, 2048)) : null;
    if (!input) return json({ error: 'unsupported' }, 422);

    const parsed = parseStreamingUrl(input);
    if (!parsed) return json({ error: 'unsupported' }, 422);

    try {
      // Cache por URL normalizada (links curtos só são conhecidos depois de resolvidos).
      if (!parsed.isShortLink) {
        const cached = await deps.findPreview(parsed.url);
        if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 86_400_000) {
          if (cached.genres === null && deps.detectGenres) {
            const genres = await detect(cached.title, cached.artist);
            if (genres) {
              await deps.saveGenres?.(cached.id, genres);
              return json({ preview: { ...cached, genres }, cached: true });
            }
          }
          return json({ preview: cached, cached: true });
        }
      }

      const preview = await buildLinkPreview(input, { fetch: deps.fetch, timeoutMs: 8000 });
      // Gênero é extra: se as lojas não responderem, o cartão sai sem ele (null = tenta de novo depois).
      const genres = preview.kind === 'artist' || preview.kind === 'playlist' ? [] : await detect(preview.title, preview.artist);
      const saved = await deps.savePreview(preview, genres);
      return json({ preview: saved, cached: false });
    } catch (err) {
      log('link-preview: erro', parsed.platform, parsed.url, err);
      const detail = deps.debug ? { detail: describe(err) } : {};
      if (err instanceof LinkPreviewError) return json({ error: err.code, ...detail }, STATUS[err.code] ?? 500);
      return json({ error: 'internal', ...detail }, 500);
    }
  };
}
