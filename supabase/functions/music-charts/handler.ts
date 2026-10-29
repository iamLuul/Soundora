// Lógica da Edge Function music-charts, separada do Deno.serve para poder ser testada
// com Supabase e APIs simulados (handler.test.ts).
//
// { action: 'chart', period? }              → as 50 mais ouvidas no mundo (Last.fm) na semana (7 dias),
//                                              no mês (30 dias) ou no ano (360 dias), com capa e se subiu/caiu
//
// Cada período é uma conta sobre as fotos diárias do ranking do Last.fm (uma por dia, guardadas
// por 360 dias): em cada dia, a 1ª colocada ganha 50 pontos, a 50ª ganha 1 e quem não estava,
// 0. Vence quem somar mais pontos; empate: mais dias no ranking, depois a melhor posição.
// Os pontos não aparecem no app, só a ordem. Subiu/caiu compara com o período anterior do
// mesmo tamanho (no ano não há: só guardamos 360 dias).
// { action: 'link', key, platform }         → link da música na plataforma da pessoa (ou a busca nela)
import { readJsonLimited } from '../_shared/body.ts';
import { isChartSourceUrl, isStreamingChoice, LastfmKeyError, platformSearchUrl, rankWithMoves, type ChartEntry, type TrackMeta } from '../_shared/links/charts.ts';
import type { Platform } from '../_shared/links/platforms.ts';

export const MAX_BODY_BYTES = 2 * 1024;

export type ChartPeriod = 'week' | 'month' | 'year';
/** Dias de cada período (sempre os últimos N dias, para o ranking ficar estável). */
export const PERIOD_DAYS: Record<ChartPeriod, number> = { week: 7, month: 30, year: 360 };
const isPeriod = (v: unknown): v is ChartPeriod => v === 'week' || v === 'month' || v === 'year';

/** Ranking de um período: as músicas na ordem e em quantos dias do período houve foto. */
export interface PeriodRanking {
  entries: ChartEntry[];
  days: number;
}

/**
 * A mesma conta do banco (public.music_chart_ranking), para os testes e como referência:
 * pontos por posição em cada dia (51 − posição), desempate por dias no ranking e melhor posição.
 */
export function aggregateChart(snapshots: Snapshot[], size = 50): PeriodRanking {
  const byKey = new Map<string, { points: number; days: number; best: number; entry: ChartEntry; last: string }>();
  for (const snap of snapshots) {
    for (const e of snap.entries) {
      const cur = byKey.get(e.key);
      const points = Math.max(0, 51 - e.position);
      if (!cur) byKey.set(e.key, { points, days: 1, best: e.position, entry: e, last: snap.taken_on });
      else {
        cur.points += points;
        cur.days += 1;
        cur.best = Math.min(cur.best, e.position);
        if (snap.taken_on > cur.last) {
          cur.entry = e;
          cur.last = snap.taken_on;
        }
      }
    }
  }
  const ranked = [...byKey.entries()]
    .sort(([ka, a], [kb, b]) => b.points - a.points || b.days - a.days || a.best - b.best || ka.localeCompare(kb))
    .slice(0, size)
    .map(([, v], i) => ({ ...v.entry, position: i + 1 }));
  return { entries: ranked, days: snapshots.length };
}

/** "2026-10-11" menos n dias. */
export function shiftDay(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}
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
  /** Ranking somado das fotos diárias entre `from` e `to` (inclusive; datas AAAA-MM-DD). */
  ranking(from: string, to: string): Promise<PeriodRanking>;
  /** A música mais recente com esta chave nas fotos guardadas (para o link de uma música do mês/ano). */
  findEntry(key: string): Promise<ChartEntry | null>;
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

  async function chart(period: ChartPeriod): Promise<Response> {
    const current = await currentChart();
    if (current === 'unavailable') return json({ error: 'charts_unavailable' }, 503);
    const { snapshot, stale } = current;
    const days = PERIOD_DAYS[period];
    const to = snapshot.taken_on;
    const from = shiftDay(to, days - 1);
    const now_ = await deps.ranking(from, to);
    // Período anterior do mesmo tamanho (no ano não: só guardamos 360 dias).
    const before = period === 'year' ? null : await deps.ranking(shiftDay(from, days), shiftDay(from, 1));
    const list = now_.entries.length ? now_.entries : snapshot.entries;
    const entries = rankWithMoves(list, before && before.days > 0 ? before.entries : null).map((e) => ({
      position: e.position,
      key: e.key,
      title: e.title,
      artist: e.artist,
      album: e.album,
      image_url: e.imageUrl,
      move: e.move,
      previous_position: e.previousPosition,
    }));
    return json({ period, days: Math.max(1, now_.days), updated_at: snapshot.fetched_at, stale, entries });
  }

  async function link(body: { key?: unknown; platform?: unknown }): Promise<Response> {
    if (typeof body.key !== 'string' || body.key.length > 300 || !isStreamingChoice(body.platform)) return json({ error: 'invalid_request' }, 400);
    const platform = body.platform;
    // Só músicas do ranking: ninguém usa a função para consultar o song.link à vontade.
    const latest = await deps.latestSnapshot();
    // Música do ranking de hoje ou de algum dia guardado (o mês e o ano têm músicas que já saíram).
    const entry = latest?.entries.find((e) => e.key === body.key) ?? (await deps.findEntry(body.key));
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
    const body = (read.value ?? {}) as { action?: unknown; key?: unknown; platform?: unknown; period?: unknown };
    if (body.action !== 'chart' && body.action !== 'link') return json({ error: 'invalid_request' }, 400);
    const period = body.period ?? 'week';
    if (!isPeriod(period)) return json({ error: 'invalid_request' }, 400);

    try {
      if (!(await deps.rateLimit(userId, body.action))) return json({ error: 'rate_limited', retry_after: 60 }, 429);
      return body.action === 'chart' ? await chart(period) : await link(body);
    } catch (err) {
      log('music-charts: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}

/**
 * Foto diária do ranking (Edge Function music-charts-daily, chamada pela tarefa agendada do
 * banco uma vez por dia). Só aceita quem tem o segredo da tarefa (cabeçalho x-cron-secret);
 * se a foto de hoje já foi tirada há pouco (alguém abriu o Trending), não busca de novo.
 */
export function createDailyHandler(deps: Pick<Deps, 'latestSnapshot' | 'saveSnapshot' | 'fetchChart' | 'now' | 'log'> & { secret: string | undefined }) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? (() => new Date());
  return async (req: Request): Promise<Response> => {
    await req.body?.cancel().catch(() => {});
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
    const given = req.headers.get('x-cron-secret') ?? '';
    if (!deps.secret || deps.secret.length < 32 || !safeEqual(given, deps.secret)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
    try {
      const today = now().toISOString().slice(0, 10);
      const latest = await deps.latestSnapshot();
      if (latest?.taken_on === today && now().getTime() - new Date(latest.fetched_at).getTime() < CHART_TTL_MS) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
      }
      const entries = await deps.fetchChart();
      if (!entries?.length) return new Response(JSON.stringify({ error: 'charts_unavailable' }), { status: 503 });
      await deps.saveSnapshot(today, entries);
      return new Response(JSON.stringify({ ok: true, taken_on: today }), { status: 200 });
    } catch (err) {
      log('music-charts-daily: falha', err);
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
    }
  };
}

/** Compara sem vazar pelo tempo de resposta onde as strings diferem. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
