// Lógica da Edge Function link-preview, separada do Deno.serve para poder ser testada
// com Supabase e plataformas simulados (handler.test.ts).
import { extractFirstUrl, parseStreamingUrl } from '../_shared/links/platforms.ts';
import { buildLinkPreview, LinkPreviewError, type FetchLike, type LinkPreview } from '../_shared/links/preview.ts';

export const CACHE_DAYS = 7;

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
}

/** O que o handler precisa do mundo externo. Em produção vem do Supabase; nos testes, de fakes. */
export interface Deps {
  /** Devolve o id da pessoa logada a partir do header Authorization, ou null. */
  getUserId(authHeader: string): Promise<string | null>;
  findPreview(url: string): Promise<PreviewRow | null>;
  savePreview(preview: LinkPreview): Promise<PreviewRow>;
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

    let input: string | null = null;
    try {
      const body = await req.json();
      input = typeof body?.url === 'string' ? extractFirstUrl(body.url.slice(0, 2048)) : null;
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    if (!input) return json({ error: 'unsupported' }, 422);

    const parsed = parseStreamingUrl(input);
    if (!parsed) return json({ error: 'unsupported' }, 422);

    try {
      // Cache por URL normalizada (links curtos só são conhecidos depois de resolvidos).
      if (!parsed.isShortLink) {
        const cached = await deps.findPreview(parsed.url);
        if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 86_400_000) {
          return json({ preview: cached, cached: true });
        }
      }

      const preview = await buildLinkPreview(input, { fetch: deps.fetch, timeoutMs: 8000 });
      const saved = await deps.savePreview(preview);
      return json({ preview: saved, cached: false });
    } catch (err) {
      log('link-preview: erro', parsed.platform, parsed.url, err);
      const detail = deps.debug ? { detail: describe(err) } : {};
      if (err instanceof LinkPreviewError) return json({ error: err.code, ...detail }, STATUS[err.code] ?? 500);
      return json({ error: 'internal', ...detail }, 500);
    }
  };
}
