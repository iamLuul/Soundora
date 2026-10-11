// Lógica da Edge Function music-charts, separada do Deno.serve para poder ser testada
// com Supabase e APIs simulados (handler.test.ts).
//
// { action: 'chart' }                       → as 50 mais tocadas no mundo (Last.fm), com capa e se subiu/caiu
// { action: 'link', key, platform }         → link da música na plataforma da pessoa (ou a busca nela)
import { readJsonLimited } from '../_shared/body.ts';
import { isStreamingChoice, LastfmKeyError, platformSearchUrl, rankWithMoves, type ChartEntry } from '../_shared/links/charts.ts';
import type { Platform } from '../_shared/links/platforms.ts';

export const MAX_BODY_BYTES = 2 * 1024;
/** O ranking muda pouco: busca de novo no Last.fm a cada 3 h. */
export const CHART_TTL_MS = 3 * 3600_000;
/** Links por plataforma valem 30 dias. */
export const LINKS_TTL_MS = 30 * 86_400_000;
/** Pedidos por pessoa (por minuto). */
export const RATE = { chart: 30, link: 30 } as const;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export interface Snapshot {
  taken_on: string;
  fetched_at: string;
  entries: ChartEntry[];
}

export interface Deps {
  getUserId(authHeader: string): Promise<string | null>;
  /** true = dentro do limite de pedidos da pessoa. */
  rateLimit(userId: string, action: keyof typeof RATE): Promise<boolean>;
  /** Ranking mais recente guardado. */
  latestSnapshot(): Promise<Snapshot | null>;
  /** Ranking para comparar com o de hoje: o mais novo com ao menos 7 dias; senão, o mais antigo antes de hoje. */
  previousSnapshot(today: string): Promise<Snapshot | null>;
  saveSnapshot(takenOn: string, entries: ChartEntry[]): Promise<void>;
  /** Baixa o ranking (Last.fm + Deezer). LastfmKeyError = chave ausente ou recusada. */
  fetchChart(): Promise<ChartEntry[] | null>;
  findLinks(deezerUrl: string): Promise<{ links: Partial<Record<Platform, string>>; checked_at: string } | null>;
  saveLinks(deezerUrl: string, links: Partial<Record<Platform, string>>): Promise<void>;
  /** Links da mesma faixa nas plataformas (song.link). null = não respondeu agora. */
  fetchLinks(deezerUrl: string): Promise<Partial<Record<Platform, string>> | null>;
  now?: () => Date;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? (() => new Date());

  /** Ranking atual: do cache se for recente; senão, busca de novo (e cai no cache velho se falhar). */
  async function currentChart(): Promise<{ snapshot: Snapshot; stale: boolean } | 'unavailable'> {
    const latest = await deps.latestSnapshot();
    if (latest && now().getTime() - new Date(latest.fetched_at).getTime() < CHART_TTL_MS) return { snapshot: latest, stale: false };
    try {
      const entries = await deps.fetchChart();
      if (entries?.length) {
        const today = now().toISOString().slice(0, 10);
        await deps.saveSnapshot(today, entries);
        return { snapshot: { taken_on: today, fetched_at: now().toISOString(), entries }, stale: false };
      }
    } catch (err) {
      if (err instanceof LastfmKeyError) log('music-charts: chave do Last.fm ausente ou recusada (LASTFM_API_KEY)');
      else log('music-charts: falha ao buscar o ranking', err);
    }
    return latest ? { snapshot: latest, stale: true } : 'unavailable';
  }

  async function chart(): Promise<Response> {
    const current = await currentChart();
    if (current === 'unavailable') return json({ error: 'charts_unavailable' }, 503);
    const { snapshot, stale } = current;
    const previous = await deps.previousSnapshot(snapshot.taken_on);
    const entries = rankWithMoves(snapshot.entries, previous?.entries ?? null).map((e) => ({
      position: e.position,
      key: e.key,
      title: e.title,
      artist: e.artist,
      album: e.album,
      image_url: e.imageUrl,
      move: e.move,
      previous_position: e.previousPosition,
    }));
    return json({ updated_at: snapshot.fetched_at, stale, entries });
  }

  async function link(body: { key?: unknown; platform?: unknown }): Promise<Response> {
    if (typeof body.key !== 'string' || body.key.length > 300 || !isStreamingChoice(body.platform)) return json({ error: 'invalid_request' }, 400);
    const platform = body.platform;
    // Só músicas do ranking: ninguém usa a função para consultar o song.link à vontade.
    const latest = await deps.latestSnapshot();
    const entry = latest?.entries.find((e) => e.key === body.key);
    if (!entry) return json({ error: 'not_found' }, 404);
    const search = platformSearchUrl(platform, entry.title, entry.artist);
    if (!entry.deezerUrl) return json({ url: search, exact: false });
    if (platform === 'deezer') return json({ url: entry.deezerUrl, exact: true });

    let links =
      (await deps.findLinks(entry.deezerUrl).then((c) => (c && now().getTime() - new Date(c.checked_at).getTime() < LINKS_TTL_MS ? c.links : null))) ?? null;
    if (!links) {
      try {
        links = await deps.fetchLinks(entry.deezerUrl);
        if (links) await deps.saveLinks(entry.deezerUrl, links);
      } catch (err) {
        log('music-charts: song.link indisponível', err);
      }
    }
    const exact = links?.[platform];
    return json(exact ? { url: exact, exact: true } : { url: search, exact: false });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let userId: string | null;
    try {
      userId = await deps.getUserId(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('music-charts: falha ao validar o usuário', err);
      return json({ error: 'not_authenticated' }, 401);
    }
    if (!userId) return json({ error: 'not_authenticated' }, 401);

    const read = await readJsonLimited(req, MAX_BODY_BYTES);
    if (!read.ok) return json({ error: read.error }, read.error === 'payload_too_large' ? 413 : 400);
    const body = (read.value ?? {}) as { action?: unknown; key?: unknown; platform?: unknown };
    if (body.action !== 'chart' && body.action !== 'link') return json({ error: 'invalid_request' }, 400);

    try {
      if (!(await deps.rateLimit(userId, body.action))) return json({ error: 'rate_limited' }, 429);
      return body.action === 'chart' ? await chart() : await link(body);
    } catch (err) {
      log('music-charts: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}
