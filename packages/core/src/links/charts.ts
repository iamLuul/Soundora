// Ranking "Mais tocadas no mundo" (aba Trending) e links da mesma música em cada plataforma.
//
// - Ranking: chart.getTopTracks do Last.fm (precisa de chave, guardada só no servidor).
// - Capa, álbum e link da Deezer: busca pública da Deezer (o Last.fm não manda mais capa).
// - Outras plataformas: song.link (Odesli), que acha a mesma faixa no Spotify, Apple Music etc.
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
  listeners: number | null;
}

/** Subiu, caiu, manteve, entrou agora (new) ou sem comparação (null). */
export type ChartMove = 'up' | 'down' | 'same' | 'new' | null;

export interface RankedEntry extends ChartEntry {
  move: ChartMove;
  previousPosition: number | null;
}

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
const DEEZER_SEARCH = 'https://api.deezer.com/search';
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
): Promise<Omit<ChartEntry, 'album' | 'imageUrl' | 'deezerUrl'>[] | null> {
  if (!/^[a-zA-Z0-9]{16,64}$/.test(apiKey)) throw new LastfmKeyError();
  const url = `${LASTFM}?method=chart.gettoptracks&api_key=${apiKey}&format=json&limit=${CHART_SIZE}`;
  const data = (await getJson(opts.fetch, url, opts.timeoutMs ?? 6000)) as { error?: unknown; tracks?: { track?: unknown[] } } | null;
  // 10 = chave inválida, 26 = chave suspensa.
  if (data?.error === 10 || data?.error === 26) throw new LastfmKeyError();
  const tracks = data?.tracks?.track;
  if (!Array.isArray(tracks)) return null;

  const out: Omit<ChartEntry, 'album' | 'imageUrl' | 'deezerUrl'>[] = [];
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

/** Capa, álbum e link da Deezer de uma faixa. Sem resultado igual, devolve tudo null. */
export async function findOnDeezer(
  ref: { title: string; artist: string },
  opts: { fetch: FetchLike; timeoutMs?: number },
): Promise<{ album: string | null; imageUrl: string | null; deezerUrl: string | null }> {
  const q = encodeURIComponent(`artist:"${ref.artist.replace(/"/g, '')}" track:"${ref.title.replace(/"/g, '')}"`);
  const data = (await getJson(opts.fetch, `${DEEZER_SEARCH}?q=${q}&limit=5`, opts.timeoutMs ?? 5000)) as { data?: DeezerHit[] } | null;
  const hit = (data?.data ?? []).find((h) => sameTrack(ref, { title: h.title, artist: h.artist?.name }));
  if (!hit) return { album: null, imageUrl: null, deezerUrl: null };
  const link = typeof hit.link === 'string' ? parseStreamingUrl(hit.link) : null;
  return {
    album: str(hit.album?.title),
    imageUrl: safeImageUrl(
      typeof hit.album?.cover_big === 'string' ? hit.album.cover_big : typeof hit.album?.cover_medium === 'string' ? hit.album.cover_medium : null,
    ),
    deezerUrl: link?.platform === 'deezer' && link.kind === 'track' ? link.url : null,
  };
}

/** Ranking completo: Last.fm + capa/álbum/link da Deezer (de 10 em 10, para não abusar da Deezer). */
export async function fetchWorldChart(apiKey: string, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<ChartEntry[] | null> {
  const top = await fetchLastfmTopTracks(apiKey, opts);
  if (!top) return null;
  const out: ChartEntry[] = [];
  for (let i = 0; i < top.length; i += 10) {
    const batch = top.slice(i, i + 10);
    const found = await Promise.all(batch.map((t) => findOnDeezer(t, opts)));
    batch.forEach((t, j) => out.push({ ...t, ...found[j]! }));
  }
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

/**
 * Links da mesma música em cada plataforma, pelo song.link, a partir do link da Deezer. Cada link é conferido: só entra se
 * for mesmo um link daquela plataforma (nada de mandar a pessoa para um site qualquer).
 * null = o song.link não respondeu agora.
 */
export async function fetchPlatformLinks(
  deezerTrackUrl: string,
  opts: { fetch: FetchLike; timeoutMs?: number; country?: string },
): Promise<Partial<Record<Platform, string>> | null> {
  const source = parseStreamingUrl(deezerTrackUrl);
  if (source?.platform !== 'deezer' || source.kind !== 'track') return null;
  const country = /^[A-Z]{2}$/.test(opts.country ?? '') ? opts.country : 'US';
  const data = (await getJson(opts.fetch, `${ODESLI}?url=${encodeURIComponent(source.url)}&userCountry=${country}`, opts.timeoutMs ?? 6000)) as {
    linksByPlatform?: Record<string, { url?: unknown }>;
  } | null;
  const byPlatform = data?.linksByPlatform;
  if (!byPlatform || typeof byPlatform !== 'object') return null;

  const links: Partial<Record<Platform, string>> = {};
  for (const [key, platform] of Object.entries(ODESLI_KEYS)) {
    const url = byPlatform[key]?.url;
    const parsed = typeof url === 'string' ? parseStreamingUrl(url) : null;
    if (parsed && parsed.platform === platform) links[platform] = parsed.url;
  }
  return links;
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
