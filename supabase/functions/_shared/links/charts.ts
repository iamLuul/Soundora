// ARQUIVO GERADO por scripts/sync-shared.mjs a partir de packages/core/src/links. Não edite aqui.
// Ranking "Mais tocadas no mundo" (aba Trending) e links da mesma música em cada plataforma.
//
// - Ranking: chart.getTopTracks do Last.fm (precisa de chave, guardada só no servidor).
// - Capa, álbum e links de origem: Deezer e Apple Music (buscas públicas); se nenhuma achar a
//   capa, a do álbum no próprio Last.fm (track.getInfo). O chart do Last.fm não manda capa.
// - Outras plataformas: song.link (Odesli), que acha a mesma faixa no Spotify, YouTube Music etc.
//   a partir do link da Deezer ou da Apple Music.
// Tudo roda no servidor (Edge Function music-charts); o app só recebe o resultado.
import { sameTrack } from './genres.ts';
import { parseStreamingUrl, safeImageUrl, type Platform } from './platforms.ts';
import type { FetchLike } from './preview.ts';

export const CHART_SIZE = 50;

/** Plataformas que a pessoa pode escolher como a sua no cadastro. */
export const STREAMING_CHOICES = [
  'spotify',
  'apple_music',
  'deezer',
  'youtube_music',
  'amazon_music',
  'tidal',
  'soundcloud',
] as const satisfies readonly Platform[];
export type StreamingChoice = (typeof STREAMING_CHOICES)[number];

export function isStreamingChoice(v: unknown): v is StreamingChoice {
  return typeof v === 'string' && (STREAMING_CHOICES as readonly string[]).includes(v);
}

export interface ChartEntry {
  position: number;
  /** Identifica a faixa entre um ranking e outro (artista + título normalizados). */
  key: string;
  title: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  /** Link da faixa na Deezer (achado pela busca), ponto de partida para as outras plataformas. */
  deezerUrl: string | null;
  /** Link da faixa na Apple Music (achado pela busca do iTunes). */
  appleUrl: string | null;
  listeners: number | null;
}

/** O que as buscas acharam de uma faixa. */
export interface TrackMeta {
  album: string | null;
  imageUrl: string | null;
  deezerUrl: string | null;
  appleUrl: string | null;
}

const EMPTY_META: TrackMeta = { album: null, imageUrl: null, deezerUrl: null, appleUrl: null };

/** Subiu, caiu, manteve, entrou agora (new) ou sem comparação (null). */
export type ChartMove = 'up' | 'down' | 'same' | 'new' | null;

export interface RankedEntry extends ChartEntry {
  move: ChartMove;
  previousPosition: number | null;
}

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
const DEEZER_SEARCH = 'https://api.deezer.com/search';
const ITUNES_SEARCH = 'https://itunes.apple.com/search';
/** Capa "vazia" (estrela cinza) que o Last.fm manda quando não tem a capa. */
const LASTFM_PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f';
const ODESLI = 'https://api.song.link/v1-alpha.1/links';
const MAX_JSON_CHARS = 2_000_000;

async function getJson(fetchFn: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_JSON_CHARS) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function str(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Chave estável da faixa: artista + título, sem acento nem caixa. */
export function chartKey(artist: string, title: string): string {
  const n = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${n(artist)}|${n(title)}`.slice(0, 300);
}

/** Erro do Last.fm que vale avisar (chave errada ou ausente). */
export class LastfmKeyError extends Error {
  constructor() {
    super('lastfm_key');
    this.name = 'LastfmKeyError';
  }
}

/** As mais tocadas no mundo segundo o Last.fm. null = não deu agora. */
export async function fetchLastfmTopTracks(
  apiKey: string,
  opts: { fetch: FetchLike; timeoutMs?: number },
): Promise<Omit<ChartEntry, keyof TrackMeta>[] | null> {
  if (!/^[a-zA-Z0-9]{16,64}$/.test(apiKey)) throw new LastfmKeyError();
  const url = `${LASTFM}?method=chart.gettoptracks&api_key=${apiKey}&format=json&limit=${CHART_SIZE}`;
  const data = (await getJson(opts.fetch, url, opts.timeoutMs ?? 6000)) as { error?: unknown; tracks?: { track?: unknown[] } } | null;
  // 10 = chave inválida, 26 = chave suspensa.
  if (data?.error === 10 || data?.error === 26) throw new LastfmKeyError();
  const tracks = data?.tracks?.track;
  if (!Array.isArray(tracks)) return null;

  const out: Omit<ChartEntry, keyof TrackMeta>[] = [];
  const seen = new Set<string>();
  for (const raw of tracks.slice(0, CHART_SIZE)) {
    const r = raw as { name?: unknown; listeners?: unknown; artist?: { name?: unknown } };
    const title = str(r.name);
    const artist = str(r.artist?.name);
    if (!title || !artist) continue;
    const key = chartKey(artist, title);
    if (seen.has(key)) continue;
    seen.add(key);
    const listeners = Number(r.listeners);
    out.push({ position: out.length + 1, key, title, artist, listeners: Number.isFinite(listeners) ? listeners : null });
  }
  return out.length ? out : null;
}

interface DeezerHit {
  title?: unknown;
  link?: unknown;
  artist?: { name?: unknown };
  album?: { title?: unknown; cover_big?: unknown; cover_medium?: unknown };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Capa, álbum e link da Deezer de uma faixa. Sem resultado igual, devolve tudo null.
 * 'quota' = a Deezer pediu para esperar (limite de 50 pedidos a cada 5 s).
 */
export async function findOnDeezer(ref: { title: string; artist: string }, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<TrackMeta | 'quota'> {
  const strict = encodeURIComponent(`artist:"${ref.artist.replace(/"/g, '')}" track:"${ref.title.replace(/"/g, '')}"`);
  const loose = encodeURIComponent(`${ref.artist} ${ref.title}`.replace(/"/g, ''));
  for (const q of [strict, loose]) {
    const data = (await getJson(opts.fetch, `${DEEZER_SEARCH}?q=${q}&limit=10`, opts.timeoutMs ?? 5000)) as {
      data?: DeezerHit[];
      error?: { code?: unknown };
    } | null;
    if (data?.error?.code === 4) return 'quota';
    const hit = (Array.isArray(data?.data) ? data.data : []).find((h) => sameTrack(ref, { title: h.title, artist: h.artist?.name }));
    if (!hit) continue;
    const link = typeof hit.link === 'string' ? parseStreamingUrl(hit.link) : null;
    const cover = typeof hit.album?.cover_big === 'string' ? hit.album.cover_big : typeof hit.album?.cover_medium === 'string' ? hit.album.cover_medium : null;
    return {
      album: str(hit.album?.title),
      imageUrl: safeImageUrl(cover),
      deezerUrl: link?.platform === 'deezer' && link.kind === 'track' ? link.url : null,
      appleUrl: null,
    };
  }
  return EMPTY_META;
}

interface ItunesHit {
  wrapperType?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  collectionName?: unknown;
  artworkUrl100?: unknown;
  trackViewUrl?: unknown;
}

/** Capa, álbum e link da Apple Music de uma faixa (busca pública do iTunes). */
export async function findOnItunes(ref: { title: string; artist: string }, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<TrackMeta> {
  const term = encodeURIComponent(`${ref.artist} ${ref.title}`);
  const data = (await getJson(opts.fetch, `${ITUNES_SEARCH}?term=${term}&media=music&entity=song&limit=10&country=us`, opts.timeoutMs ?? 5000)) as {
    results?: ItunesHit[];
  } | null;
  const hit = (Array.isArray(data?.results) ? data.results : []).find((h) => sameTrack(ref, { title: h.trackName, artist: h.artistName }));
  if (!hit) return EMPTY_META;
  const link = typeof hit.trackViewUrl === 'string' ? parseStreamingUrl(hit.trackViewUrl) : null;
  const art = typeof hit.artworkUrl100 === 'string' ? hit.artworkUrl100.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, '/600x600bb.$2') : null;
  return {
    album: str(hit.collectionName),
    imageUrl: safeImageUrl(art),
    deezerUrl: null,
    appleUrl: link?.platform === 'apple_music' && link.kind === 'track' ? link.url : null,
  };
}

/** Capa do álbum pelo próprio Last.fm (track.getInfo), quando as lojas não acharam. */
export async function findOnLastfm(
  apiKey: string,
  ref: { title: string; artist: string },
  opts: { fetch: FetchLike; timeoutMs?: number },
): Promise<{ album: string | null; imageUrl: string | null }> {
  if (!/^[a-zA-Z0-9]{16,64}$/.test(apiKey)) return { album: null, imageUrl: null };
  const url = `${LASTFM}?method=track.getinfo&api_key=${apiKey}&format=json&autocorrect=1&artist=${encodeURIComponent(ref.artist)}&track=${encodeURIComponent(ref.title)}`;
  const data = (await getJson(opts.fetch, url, opts.timeoutMs ?? 5000)) as { track?: { album?: { title?: unknown; image?: { '#text'?: unknown }[] } } } | null;
  const album = data?.track?.album;
  const images = Array.isArray(album?.image) ? album.image : [];
  const biggest = [...images].reverse().find((i) => typeof i['#text'] === 'string' && i['#text'] && !i['#text'].includes(LASTFM_PLACEHOLDER));
  return { album: str(album?.title), imageUrl: safeImageUrl(biggest?.['#text'] as string | undefined) };
}

/** Junta o que cada fonte achou: o primeiro valor que existir vence. */
function merge(a: TrackMeta, b: Partial<TrackMeta>): TrackMeta {
  return {
    album: a.album ?? b.album ?? null,
    imageUrl: a.imageUrl ?? b.imageUrl ?? null,
    deezerUrl: a.deezerUrl ?? b.deezerUrl ?? null,
    appleUrl: a.appleUrl ?? b.appleUrl ?? null,
  };
}

/**
 * Metadados de uma faixa por todas as fontes: Deezer, depois Apple Music para o que faltar
 * (link da Apple e capa), e por fim a capa do Last.fm.
 */
export async function findTrackMeta(
  ref: { title: string; artist: string },
  opts: { fetch: FetchLike; timeoutMs?: number; lastfmKey?: string; useItunes?: boolean; quotaWaitMs?: number },
): Promise<TrackMeta> {
  let deezer = await findOnDeezer(ref, opts);
  if (deezer === 'quota') {
    await wait(opts.quotaWaitMs ?? 5500);
    deezer = await findOnDeezer(ref, opts);
  }
  let meta = deezer === 'quota' ? EMPTY_META : deezer;
  if (opts.useItunes !== false && (!meta.imageUrl || !meta.appleUrl)) meta = merge(meta, await findOnItunes(ref, opts));
  if (!meta.imageUrl && opts.lastfmKey) meta = merge(meta, await findOnLastfm(opts.lastfmKey, ref, opts));
  return meta;
}

/**
 * Ranking completo: Last.fm + capa/álbum/links. Vai de 5 em 5 com uma pausa, para ficar dentro
 * dos limites da Deezer (50 pedidos a cada 5 s) e do iTunes (cerca de 20 por minuto).
 */
export async function fetchWorldChart(
  apiKey: string,
  opts: { fetch: FetchLike; timeoutMs?: number; pauseMs?: number; quotaWaitMs?: number; log?: (...a: unknown[]) => void },
): Promise<ChartEntry[] | null> {
  const top = await fetchLastfmTopTracks(apiKey, opts);
  if (!top) return null;
  const out: ChartEntry[] = [];
  let itunesCalls = 0;
  for (let i = 0; i < top.length; i += 5) {
    if (i > 0) await wait(opts.pauseMs ?? 600);
    const batch = top.slice(i, i + 5);
    // O iTunes é usado nas primeiras posições (onde mais importa) para não passar do limite dele.
    const useItunes = itunesCalls < 18;
    if (useItunes) itunesCalls += batch.length;
    const found = await Promise.all(batch.map((t) => findTrackMeta(t, { ...opts, lastfmKey: apiKey, useItunes })));
    batch.forEach((t, j) => out.push({ ...t, ...found[j]! }));
  }
  opts.log?.(
    `music-charts: ${out.length} músicas, ${out.filter((e) => e.imageUrl).length} com capa, ` +
      `${out.filter((e) => e.deezerUrl || e.appleUrl).length} com link de origem (Deezer ${out.filter((e) => e.deezerUrl).length}, Apple ${out.filter((e) => e.appleUrl).length})`,
  );
  return out;
}

/** Compara com o ranking anterior: subiu, caiu ou entrou agora. Sem ranking anterior, não marca nada. */
export function rankWithMoves(current: ChartEntry[], previous: ChartEntry[] | null): RankedEntry[] {
  const before = new Map((previous ?? []).map((e) => [e.key, e.position]));
  return current.map((e) => {
    if (!previous) return { ...e, move: null, previousPosition: null };
    const old = before.get(e.key) ?? null;
    const move: ChartMove = old === null ? 'new' : old > e.position ? 'up' : old < e.position ? 'down' : 'same';
    return { ...e, move, previousPosition: old };
  });
}

/** Nome das plataformas no song.link. */
const ODESLI_KEYS: Record<string, Platform> = {
  spotify: 'spotify',
  appleMusic: 'apple_music',
  deezer: 'deezer',
  youtubeMusic: 'youtube_music',
  youtube: 'youtube',
  amazonMusic: 'amazon_music',
  tidal: 'tidal',
  soundcloud: 'soundcloud',
};

/** Link de faixa da Deezer ou da Apple Music (os que o song.link recebe como origem). */
export function isChartSourceUrl(url: string): boolean {
  const parsed = parseStreamingUrl(url);
  return !!parsed && parsed.kind === 'track' && (parsed.platform === 'deezer' || parsed.platform === 'apple_music') && parsed.url === url;
}

/** Link de faixa (já normalizado) de uma plataforma que o song.link conhece. */
export function isTrackSourceUrl(url: string): boolean {
  const parsed = parseStreamingUrl(url);
  return !!parsed && parsed.kind === 'track' && Object.values(ODESLI_KEYS).includes(parsed.platform) && parsed.url === url;
}

/** Links e capas da mesma música em cada plataforma (song.link). */
export interface PlatformTracks {
  links: Partial<Record<Platform, string>>;
  /** Capa de cada plataforma, do catálogo da própria plataforma (só CDNs conhecidos). */
  images: Partial<Record<Platform, string>>;
}

/** O song.link pediu para esperar (limite de pedidos) ou falhou; tentar de novo depois. */
export class SongLinkUnavailableError extends Error {
  constructor(status: number | string) {
    super(`song.link indisponível (${status})`);
    this.name = 'SongLinkUnavailableError';
  }
}

/**
 * Links e capas da mesma música em cada plataforma, pelo song.link, a partir do link de uma
 * faixa (Deezer, Apple Music, Spotify...). Cada link é conferido: só entra se for mesmo um link
 * daquela plataforma (nada de mandar a pessoa para um site qualquer). Cada capa vem da própria
 * plataforma (o song.link repassa a do catálogo dela).
 * null = o song.link não conhece a música. Limite de pedidos, erro do servidor ou rede:
 * SongLinkUnavailableError (não é "não achou": tentar de novo depois).
 */
export async function fetchPlatformTracks(
  sourceTrackUrl: string,
  opts: { fetch: FetchLike; timeoutMs?: number; country?: string; apiKey?: string },
): Promise<PlatformTracks | null> {
  if (!isTrackSourceUrl(sourceTrackUrl)) return null;
  const source = parseStreamingUrl(sourceTrackUrl)!;
  const country = /^[A-Z]{2}$/.test(opts.country ?? '') ? opts.country : 'US';
  const key = opts.apiKey && /^[\w-]{1,200}$/.test(opts.apiKey) ? `&key=${opts.apiKey}` : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  let data: {
    linksByPlatform?: Record<string, { url?: unknown; entityUniqueId?: unknown }>;
    entitiesByUniqueId?: Record<string, { thumbnailUrl?: unknown }>;
  } | null;
  try {
    const res = await opts.fetch(`${ODESLI}?url=${encodeURIComponent(source.url)}&userCountry=${country}${key}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429 || res.status >= 500) throw new SongLinkUnavailableError(res.status);
    if (!res.ok) return null;
    const text = await res.text();
    data = text.length > MAX_JSON_CHARS ? null : JSON.parse(text);
  } catch (err) {
    if (err instanceof SongLinkUnavailableError) throw err;
    if (err instanceof SyntaxError) return null;
    throw new SongLinkUnavailableError('rede');
  } finally {
    clearTimeout(timer);
  }
  const byPlatform = data?.linksByPlatform;
  if (!byPlatform || typeof byPlatform !== 'object') return null;
  const entities = data?.entitiesByUniqueId && typeof data.entitiesByUniqueId === 'object' ? data.entitiesByUniqueId : {};

  const links: Partial<Record<Platform, string>> = {};
  const images: Partial<Record<Platform, string>> = {};
  for (const [name, platform] of Object.entries(ODESLI_KEYS)) {
    const entry = byPlatform[name];
    const url = entry?.url;
    const parsed = typeof url === 'string' ? parseStreamingUrl(url) : null;
    if (!parsed || parsed.platform !== platform) continue;
    links[platform] = parsed.url;
    const entity = typeof entry?.entityUniqueId === 'string' ? entities[entry.entityUniqueId] : undefined;
    const image = safeImageUrl(typeof entity?.thumbnailUrl === 'string' ? entity.thumbnailUrl : null);
    if (image) images[platform] = image;
  }
  return { links, images };
}

/** Só os links (null também quando o song.link não respondeu agora). */
export async function fetchPlatformLinks(
  sourceTrackUrl: string,
  opts: { fetch: FetchLike; timeoutMs?: number; country?: string; apiKey?: string },
): Promise<Partial<Record<Platform, string>> | null> {
  try {
    return (await fetchPlatformTracks(sourceTrackUrl, opts))?.links ?? null;
  } catch {
    return null;
  }
}

/** Busca da música na plataforma, para quando não há o link exato. */
export function platformSearchUrl(platform: StreamingChoice, title: string, artist: string): string {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  switch (platform) {
    case 'spotify':
      return `https://open.spotify.com/search/${q}`;
    case 'apple_music':
      return `https://music.apple.com/search?term=${q}`;
    case 'deezer':
      return `https://www.deezer.com/search/${q}`;
    case 'youtube_music':
      return `https://music.youtube.com/search?q=${q}`;
    case 'amazon_music':
      return `https://music.amazon.com/search/${q}`;
    case 'tidal':
      return `https://listen.tidal.com/search?q=${q}`;
    case 'soundcloud':
      return `https://soundcloud.com/search?q=${q}`;
  }
}
