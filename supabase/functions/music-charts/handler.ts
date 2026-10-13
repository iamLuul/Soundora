// Lógica da Edge Function music-charts, separada do Deno.serve para poder ser testada
// com Supabase e APIs simulados (handler.test.ts).
//
// { action: 'chart' }                       → as 50 mais tocadas no mundo (Last.fm), com capa e se subiu/caiu
// { action: 'link', key, platform }         → link da música na plataforma da pessoa (ou a busca nela)
import { readJsonLimited } from '../_shared/body.ts';
import { isChartSourceUrl, isStreamingChoice, LastfmKeyError, platformSearchUrl, rankWithMoves, type ChartEntry, type TrackMeta } from '../_shared/links/charts.ts';
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
  findLinks(sourceUrl: string): Promise<{ links: Partial<Record<Platform, string>>; checked_at: string } | null>;
  saveLinks(sourceUrl: string, links: Partial<Record<Platform, string>>): Promise<void>;
  /** Links da mesma faixa nas plataformas (song.link), a partir do link da Deezer ou da Apple. null = não respondeu agora. */
  fetchLinks(sourceUrl: string): Promise<Partial<Record<Platform, string>> | null>;
  /** Procura de novo capa e links de uma música (quando o ranking veio sem o link de origem). */
  findMeta(ref: { title: string; artist: string }): Promise<TrackMeta>;
  /** Roda depois da resposta (atualizar o ranking sem a pessoa esperar). */
  background?(task: Promise<unknown>): void;
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

  /** Ranking salvo antes desta versão (sem capa/links da Apple): busca de novo na hora. */
  const oldFormat = (snap: Snapshot) => snap.entries.some((e) => !('appleUrl' in e));

  let refreshing: Promise<Snapshot | null> | null = null;
  /** Busca o ranking de novo e guarda. Um pedido por vez (os outros esperam o mesmo). */
  function refresh(): Promise<Snapshot | null> {
    refreshing ??= (async () => {
      try {
        const entries = await deps.fetchChart();
        if (!entries?.length) return null;
        const today = now().toISOString().slice(0, 10);
        await deps.saveSnapshot(today, entries);
        return { taken_on: today, fetched_at: now().toISOString(), entries };
      } catch (err) {
        if (err instanceof LastfmKeyError) log('music-charts: chave do Last.fm ausente ou recusada (LASTFM_API_KEY)');
        else log('music-charts: falha ao buscar o ranking', err);
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  /**
   * Ranking atual: do cache se for recente. Vencido, mostra o guardado e atualiza por trás
   * (buscar capas e links de 50 músicas leva alguns segundos). Sem nenhum guardado, espera.
   */
  async function currentChart(): Promise<{ snapshot: Snapshot; stale: boolean } | 'unavailable'> {
    const latest = await deps.latestSnapshot();
    const usable = latest && !oldFormat(latest) ? latest : null;
    if (usable && now().getTime() - new Date(usable.fetched_at).getTime() < CHART_TTL_MS) return { snapshot: usable, stale: false };
    if (usable && deps.background) {
      deps.background(refresh());
      return { snapshot: usable, stale: true };
    }
    const fresh = await refresh();
    if (fresh) return { snapshot: fresh, stale: false };
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

    // Ranking sem o link de origem: procura de novo só esta música, na hora.
    let meta: Pick<TrackMeta, 'deezerUrl' | 'appleUrl'> = { deezerUrl: entry.deezerUrl ?? null, appleUrl: entry.appleUrl ?? null };
    if (!meta.deezerUrl && !meta.appleUrl) {
      try {
        meta = await deps.findMeta(entry);
      } catch (err) {
        log('music-charts: busca da música falhou', err);
      }
    }
    if (platform === 'deezer' && meta.deezerUrl) return json({ url: meta.deezerUrl, exact: true });
    if (platform === 'apple_music' && meta.appleUrl) return json({ url: meta.appleUrl, exact: true });
    const source = [meta.deezerUrl, meta.appleUrl].find((u): u is string => !!u && isChartSourceUrl(u));
    if (!source) {
      log(`music-charts: sem link de origem para "${entry.artist} - ${entry.title}"; abrindo a busca`);
      return json({ url: search, exact: false });
    }

    const cached = await deps.findLinks(source);
    let links = cached && now().getTime() - new Date(cached.checked_at).getTime() < LINKS_TTL_MS ? cached.links : null;
    if (!links) {
      try {
        links = await deps.fetchLinks(source);
        if (links) await deps.saveLinks(source, links);
        else log(`music-charts: song.link não respondeu para ${source}`);
      } catch (err) {
        log('music-charts: song.link indisponível', err);
      }
    }
    const exact = links?.[platform] ?? (platform === 'deezer' ? meta.deezerUrl : platform === 'apple_music' ? meta.appleUrl : null);
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
      if (!(await deps.rateLimit(userId, body.action))) return json({ error: 'rate_limited', retry_after: 60 }, 429);
      return body.action === 'chart' ? await chart() : await link(body);
    } catch (err) {
      log('music-charts: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}
