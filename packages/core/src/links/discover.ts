// Recomendações do Descobrir: o "algoritmo" que monta a pilha de cartões.
//
// Sementes: as músicas que a pessoa curtiu (Descobrir) e os gêneros do perfil.
//   - Parecidas com o que curtiu: track.getSimilar do Last.fm.
//   - Dos gêneros: tag.getTopTracks do Last.fm (cada gênero do Soundora vira uma tag).
//   - Sem nada ainda: as mais tocadas no mundo.
// Cada sugestão é achada na Deezer (capa, álbum, foto do artista, prévia de 30 s e link),
// que é de onde o cartão toca a prévia e de onde sai o link para as outras plataformas.
// Roda só no servidor (Edge Function discover): a chave do Last.fm não vai para o app.
import { chartKey, fetchLastfmTopTracks, LastfmKeyError } from './charts.ts';
import { isAllowedAudioUrl, sameTrack, type GenreSlug } from './genres.ts';
import { parseStreamingUrl, safeImageUrl } from './platforms.ts';
import type { FetchLike } from './preview.ts';

/** Tag do Last.fm de cada gênero do Soundora. */
export const LASTFM_GENRE_TAGS: Record<GenreSlug, string> = {
  acoustic: 'acoustic',
  alternative: 'alternative',
  ambient: 'ambient',
  anime: 'anime',
  blues: 'blues',
  bossa_nova: 'bossa nova',
  classical: 'classical',
  country: 'country',
  dance: 'dance',
  drum_and_bass: 'drum and bass',
  electronic: 'electronic',
  emo: 'emo',
  folk: 'folk',
  forro: 'forro',
  funk_br: 'funk carioca',
  gospel: 'gospel',
  hip_hop: 'hip-hop',
  house: 'house',
  indie: 'indie',
  jazz: 'jazz',
  k_pop: 'k-pop',
  latin: 'latin',
  lo_fi: 'lo-fi',
  metal: 'metal',
  mpb: 'mpb',
  pagode: 'pagode',
  pop: 'pop',
  punk: 'punk',
  r_and_b: 'rnb',
  reggae: 'reggae',
  rock: 'rock',
  samba: 'samba',
  sertanejo: 'sertanejo',
  shoegaze: 'shoegaze',
  soul: 'soul',
  techno: 'techno',
  trap: 'trap',
};

export interface TrackRef {
  title: string;
  artist: string;
}

/** Por que a música apareceu: parecida com uma curtida, de um gênero, ou em alta. */
export type Reason = { kind: 'similar'; because: TrackRef } | { kind: 'genre'; genre: string } | { kind: 'popular' };

export interface Candidate extends TrackRef {
  key: string;
  reason: Reason;
}

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
const DEEZER = 'https://api.deezer.com';
const MAX_JSON_CHARS = 2_000_000;
const KEY_RE = /^[a-zA-Z0-9]{16,64}$/;

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

/** Lista de faixas do Last.fm ({ name, artist: { name } }) em TrackRef. */
function refs(list: unknown, limit: number): TrackRef[] {
  if (!Array.isArray(list)) return [];
  const out: TrackRef[] = [];
  for (const raw of list) {
    const r = raw as { name?: unknown; artist?: { name?: unknown } | unknown };
    const title = str(r.name);
    const artist = str(typeof r.artist === 'object' && r.artist ? (r.artist as { name?: unknown }).name : r.artist);
    if (title && artist) out.push({ title, artist });
    if (out.length >= limit) break;
  }
  return out;
}

type Opts = { fetch: FetchLike; timeoutMs?: number };

/** Músicas parecidas com uma (Last.fm track.getSimilar). */
export async function fetchSimilarTracks(apiKey: string, ref: TrackRef, limit: number, opts: Opts): Promise<TrackRef[]> {
  if (!KEY_RE.test(apiKey)) throw new LastfmKeyError();
  const url = `${LASTFM}?method=track.getsimilar&api_key=${apiKey}&format=json&autocorrect=1&limit=${limit}&artist=${encodeURIComponent(ref.artist)}&track=${encodeURIComponent(ref.title)}`;
  const data = (await getJson(opts.fetch, url, opts.timeoutMs ?? 5000)) as { error?: unknown; similartracks?: { track?: unknown } } | null;
  if (data?.error === 10 || data?.error === 26) throw new LastfmKeyError();
  return refs(data?.similartracks?.track, limit);
}

/** Tag do Last.fm de um gênero: as dos 37 de destaque estão na tabela; as do catálogo grande são o próprio nome. */
export function lastfmTag(genre: string): string {
  return LASTFM_GENRE_TAGS[genre as GenreSlug] ?? genre.replace(/_/g, ' ');
}

/** As mais ouvidas de um gênero (Last.fm tag.getTopTracks). `page` varia a seleção. */
export async function fetchGenreTracks(apiKey: string, genre: string, page: number, limit: number, opts: Opts): Promise<TrackRef[]> {
  if (!KEY_RE.test(apiKey)) throw new LastfmKeyError();
  const tag = encodeURIComponent(lastfmTag(genre));
  const url = `${LASTFM}?method=tag.gettoptracks&api_key=${apiKey}&format=json&tag=${tag}&limit=${limit}&page=${Math.max(1, Math.min(page, 10))}`;
  const data = (await getJson(opts.fetch, url, opts.timeoutMs ?? 5000)) as { error?: unknown; tracks?: { track?: unknown } } | null;
  if (data?.error === 10 || data?.error === 26) throw new LastfmKeyError();
  return refs(data?.tracks?.track, limit);
}

/** O que a Deezer tem da música: tudo o que o cartão mostra. */
export interface DeezerTrack {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  artistImageUrl: string | null;
  previewUrl: string | null;
}

interface DeezerHit {
  id?: unknown;
  title?: unknown;
  link?: unknown;
  preview?: unknown;
  artist?: { name?: unknown; picture_medium?: unknown };
  album?: { title?: unknown; cover_big?: unknown; cover_medium?: unknown };
}

function toDeezerTrack(hit: DeezerHit, fallback: TrackRef): DeezerTrack | null {
  const link = typeof hit.link === 'string' ? parseStreamingUrl(hit.link) : null;
  if (link?.platform !== 'deezer' || link.kind !== 'track' || !link.id) return null;
  const cover = typeof hit.album?.cover_big === 'string' ? hit.album.cover_big : typeof hit.album?.cover_medium === 'string' ? hit.album.cover_medium : null;
  return {
    id: link.id,
    url: link.url,
    title: str(hit.title) ?? fallback.title,
    artist: str(hit.artist?.name) ?? fallback.artist,
    album: str(hit.album?.title),
    imageUrl: safeImageUrl(cover),
    artistImageUrl: safeImageUrl(typeof hit.artist?.picture_medium === 'string' ? hit.artist.picture_medium : null),
    previewUrl: isAllowedAudioUrl(hit.preview) ? hit.preview : null,
  };
}

/** Acha a música na Deezer (busca exata, depois solta). null = não achou; 'quota' = esperar. */
export async function findDeezerTrack(ref: TrackRef, opts: Opts): Promise<DeezerTrack | null | 'quota'> {
  const strict = encodeURIComponent(`artist:"${ref.artist.replace(/"/g, '')}" track:"${ref.title.replace(/"/g, '')}"`);
  const loose = encodeURIComponent(`${ref.artist} ${ref.title}`.replace(/"/g, ''));
  for (const q of [strict, loose]) {
    const data = (await getJson(opts.fetch, `${DEEZER}/search?q=${q}&limit=10`, opts.timeoutMs ?? 5000)) as {
      data?: DeezerHit[];
      error?: { code?: unknown };
    } | null;
    if (data?.error?.code === 4) return 'quota';
    const hit = (Array.isArray(data?.data) ? data.data : []).find((h) => sameTrack(ref, { title: h.title, artist: h.artist?.name }));
    if (hit) return toDeezerTrack(hit, ref);
  }
  return null;
}

/** A mesma faixa da Deezer pelo id (a prévia da Deezer vence: busca uma nova). */
export async function deezerTrackById(id: string, opts: Opts): Promise<DeezerTrack | null> {
  if (!/^\d{1,15}$/.test(id)) return null;
  const hit = (await getJson(opts.fetch, `${DEEZER}/track/${id}`, opts.timeoutMs ?? 5000)) as DeezerHit | null;
  return hit && !('error' in (hit as object)) ? toDeezerTrack(hit, { title: '', artist: '' }) : null;
}

/** Embaralha (Fisher–Yates) com a função de sorteio dada (testável). */
export function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Junta as sugestões numa ordem só: alterna parecidas-com-curtidas e de-gêneros (as duas
 * fontes já embaralhadas), sem repetir música e sem nada que a pessoa já viu.
 */
export function mixCandidates(sources: { similar: Candidate[]; genre: Candidate[]; popular: Candidate[] }, exclude: ReadonlySet<string>, size: number): Candidate[] {
  const seen = new Set(exclude);
  const out: Candidate[] = [];
  const queues = [sources.similar, sources.genre, sources.popular].map((q) => [...q]);
  // Duas parecidas para cada uma de gênero: o que a pessoa curte pesa mais.
  const pattern = [0, 0, 1];
  let step = 0;
  while (out.length < size && queues.some((q) => q.length)) {
    const preferred = pattern[step++ % pattern.length]!;
    const order = [preferred, ...[0, 1, 2].filter((i) => i !== preferred)];
    const queue = order.map((i) => queues[i]!).find((q) => q.length)!;
    const c = queue.shift()!;
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}

export interface Seeds {
  /** Gêneros do perfil (slugs do catálogo). */
  genres: string[];
  /** Curtidas no Descobrir (as mais recentes primeiro). */
  liked: TrackRef[];
  /** Chaves (artista|título) de tudo o que a pessoa já viu no Descobrir. */
  seenKeys: string[];
}

/**
 * Sugestões da vez (ainda sem a Deezer). Com `onlyGenre`, só desse gênero (busca de gênero no
 * topo da tela). As consultas ao Last.fm que falharem só deixam a lista menor.
 */
export async function recommend(
  apiKey: string,
  seeds: Seeds,
  opts: Opts & { size: number; onlyGenre?: string | null; random?: () => number },
): Promise<Candidate[]> {
  const random = opts.random ?? Math.random;
  const page = () => 1 + Math.floor(random() * 3);
  const asCandidates = (list: TrackRef[], reason: Reason) => list.map((t) => ({ ...t, key: chartKey(t.artist, t.title), reason }));
  const safe = async (p: Promise<TrackRef[]>) => p.catch((e) => (e instanceof LastfmKeyError ? Promise.reject(e) : []));

  if (opts.onlyGenre) {
    const genre = opts.onlyGenre;
    const lists = await Promise.all([1, 2].map((n) => safe(fetchGenreTracks(apiKey, genre, page() + n - 1, 50, opts))));
    return mixCandidates({ similar: [], genre: shuffle(asCandidates(lists.flat(), { kind: 'genre', genre }), random), popular: [] }, new Set(seeds.seenKeys), opts.size);
  }

  // Até 4 curtidas (as recentes têm mais chance) e até 4 gêneros, sorteados a cada vez.
  const likedSeeds = shuffle(seeds.liked.slice(0, 12), random).slice(0, 4);
  const genreSeeds = shuffle(seeds.genres, random).slice(0, 4);
  const [similarLists, genreLists] = await Promise.all([
    Promise.all(likedSeeds.map((l) => safe(fetchSimilarTracks(apiKey, l, 15, opts)).then((list) => asCandidates(list, { kind: 'similar', because: l })))),
    Promise.all(genreSeeds.map((g) => safe(fetchGenreTracks(apiKey, g, page(), 30, opts)).then((list) => asCandidates(list, { kind: 'genre', genre: g })))),
  ]);
  const similar = shuffle(similarLists.flat(), random);
  const genre = shuffle(genreLists.flat(), random);
  let popular: Candidate[] = [];
  if (similar.length + genre.length < opts.size) {
    const top = (await fetchLastfmTopTracks(apiKey, opts).catch((e) => (e instanceof LastfmKeyError ? Promise.reject(e) : null))) ?? [];
    popular = shuffle(asCandidates(top, { kind: 'popular' }), random);
  }
  return mixCandidates({ similar, genre, popular }, new Set(seeds.seenKeys), opts.size);
}

/**
 * Prévias da Deezer vêm assinadas com validade no próprio link (`hdnea=exp=<segundos>`).
 * Vencido, o servidor da Deezer recusa e o player não toca. null = o link não diz.
 */
export function previewExpiresAt(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = /[?&~](?:hdnea|hdnts)=(?:[^&]*?[~=])?exp=(\d{9,11})\b/.exec(url) ?? /[?&]exp=(\d{9,11})\b/.exec(url);
  return m ? Number(m[1]) * 1000 : null;
}

/** A prévia ainda toca daqui a `marginMs`? Sem link, não; link sem validade, sim. */
export function previewUsable(url: string | null | undefined, now: number = Date.now(), marginMs = 60_000): boolean {
  if (!url) return false;
  const exp = previewExpiresAt(url);
  return exp == null || exp - marginMs > now;
}
