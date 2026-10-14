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
  /** Prévia de 30 s oficial da Apple/Deezer (null = não achou). */
  audio_url: string | null;
  /** Quando as lojas foram consultadas (null = ainda não). */
  store_checked_at: string | null;
}

/** O que as lojas disseram da música. */
export interface StoreInfo {
  genres: string[];
  audioUrl: string | null;
}

export interface StoreRef {
  title: string;
  artist: string | null;
  platform: string;
  kind: string;
  providerId: string | null;
}

/** A prévia da Deezer vence em algumas horas: consulta de novo depois de 6 h. */
const DEEZER_AUDIO_TTL_MS = 6 * 3600_000;

function storeIsStale(row: PreviewRow): boolean {
  if (!row.store_checked_at) return true;
  return !!row.audio_url?.includes('dzcdn.net') && Date.now() - new Date(row.store_checked_at).getTime() > DEEZER_AUDIO_TTL_MS;
}

/** O que o handler precisa do mundo externo. Em produção vem do Supabase; nos testes, de fakes. */
export interface Deps {
  /** Devolve o id da pessoa logada a partir do header Authorization, ou null. */
  getUserId(authHeader: string): Promise<string | null>;
  findPreview(url: string): Promise<PreviewRow | null>;
  /** Grava o cartão; store = o que as lojas disseram (null = não deu para consultar agora). */
  savePreview(preview: LinkPreview, store: StoreInfo | null): Promise<PreviewRow>;
  /** Gêneros e prévia de 30 s pelas lojas (Apple/Deezer). Opcional: sem ele, não consulta. */
  detectStore?(ref: StoreRef): Promise<StoreInfo>;
  /** Grava gêneros e prévia num cartão que já existia (veio do cache sem eles ou vencido). */
  saveStore?(id: string, store: StoreInfo): Promise<void>;
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

  /** O que as lojas disseram, ou null se a consulta falhou de vez. */
  const detect = async (ref: StoreRef): Promise<StoreInfo | null> => {
    if (!deps.detectStore) return null;
    // Artista e playlist não têm gênero nem prévia de uma faixa.
    if (ref.kind === 'artist' || ref.kind === 'playlist') return { genres: [], audioUrl: null };
    try {
      // Só os gêneros: a prévia de 30 s das lojas não é mais usada no cartão (as licenças da
      // Apple e da Deezer não cobrem tocar a prévia numa vibe, nem junto do link de outra loja).
      const { genres } = await deps.detectStore(ref);
      return { genres, audioUrl: null };
    } catch (err) {
      log('link-preview: lojas indisponíveis', err);
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
          if (deps.detectStore && storeIsStale(cached)) {
            const info = await detect({ title: cached.title, artist: cached.artist, platform: cached.platform, kind: cached.kind, providerId: cached.provider_id });
            if (info) {
              await deps.saveStore?.(cached.id, info);
              return json({ preview: { ...cached, genres: info.genres, audio_url: info.audioUrl, store_checked_at: new Date().toISOString() }, cached: true });
            }
          }
          return json({ preview: { ...cached, audio_url: null }, cached: true });
        }
      }

      const preview = await buildLinkPreview(input, { fetch: deps.fetch, timeoutMs: 8000 });
      // Gênero e prévia são extras: se as lojas não responderem, o cartão sai sem eles (tenta de novo depois).
      const info = await detect({ title: preview.title, artist: preview.artist, platform: preview.platform, kind: preview.kind, providerId: preview.providerId });
      const saved = await deps.savePreview(preview, info);
      return json({ preview: saved, cached: false });
    } catch (err) {
      log('link-preview: erro', parsed.platform, parsed.url, err);
      const detail = deps.debug ? { detail: describe(err) } : {};
      if (err instanceof LinkPreviewError) return json({ error: err.code, ...detail }, STATUS[err.code] ?? 500);
      return json({ error: 'internal', ...detail }, 500);
    }
  };
}
