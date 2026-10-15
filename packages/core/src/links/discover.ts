// Recomendações do Descobrir: o "algoritmo" que monta a pilha de cartões.
//
// Sementes: as músicas que a pessoa curtiu (Descobrir) e os gêneros do perfil.
//   - Parecidas com o que curtiu: track.getSimilar do Last.fm.
//   - Dos gêneros: tag.getTopTracks do Last.fm (cada gênero do Soundhora vira uma tag).
//   - Sem nada ainda: as mais tocadas no mundo.
// Cada sugestão é achada na Deezer (capa, álbum, foto do artista, prévia de 30 s e link),
// que é de onde o cartão toca a prévia e de onde sai o link para as outras plataformas.
// Roda só no servidor (Edge Function discover): a chave do Last.fm não vai para o app.
import { chartKey, fetchLastfmTopTracks, LastfmKeyError } from './charts.ts';
import { isAllowedAudioUrl, sameTrack, type GenreSlug } from './genres.ts';
import { parseStreamingUrl, safeImageUrl } from './platforms.ts';
import type { FetchLike } from './preview.ts';

/** Tag do Last.fm de cada gênero do Soundhora. */
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

/**
 * Gêneros do catálogo grande cujo nome sozinho acha pouco (ou a coisa errada) no Last.fm: a
 * tag certa primeiro e as reservas depois (usadas quando a anterior tem poucas músicas).
 * Ex.: o funk brasileiro e seus subgêneros caem em "funk carioca" (a tag "funk" é o funk
 * americano dos anos 70).
 */
export const LASTFM_TAG_CHAINS: Record<string, string[]> = {
  funk_br: ['funk carioca', 'baile funk', 'funk brasileiro'],
  funk_rj: ['funk carioca', 'baile funk', 'funk rj'],
  funk_paulista: ['funk paulista', 'funk ostentacao', 'funk carioca'],
  funk_ostentacao: ['funk ostentacao', 'funk paulista', 'funk carioca'],
  funk_mandelao: ['funk mandelao', 'funk bh', 'funk carioca'],
  funk_bh: ['funk bh', 'funk mandelao', 'funk carioca'],
  brega_funk: ['brega funk', 'bregafunk', 'funk carioca'],
  funk_melody: ['funk melody', 'funk carioca'],
  funk_das_antigas: ['funk das antigas', 'funk melody', 'funk carioca'],
  funk_consciente: ['funk consciente', 'funk carioca'],
  funk_mtg: ['funk mtg', 'funk carioca'],
  mega_funk: ['mega funk', 'funk carioca'],
  funk_bpm: ['funk bpm', 'funk carioca'],
  funk_viral: ['funk viral', 'funk carioca'],
  rave_funk: ['rave funk', 'funk carioca'],
  trap_funk: ['trap funk', 'funk carioca'],
  funk_pop: ['funk pop', 'funk carioca'],
  funk_evangelico: ['funk evangelico', 'funk gospel', 'funk carioca'],
  funk: ['funk', 'p-funk'],
};

/**
 * Tags do Last.fm de um gênero, na ordem em que valem: a do gênero (tabela dos 37 de destaque,
 * cadeia acima ou o próprio nome) e, como reserva, a dos gêneros de destaque que aparecem no
 * nome ("sertanejo_universitario" → "sertanejo").
 */
export function lastfmTags(genre: string): string[] {
  const chain = LASTFM_TAG_CHAINS[genre];
  if (chain) return chain;
  const own = LASTFM_GENRE_TAGS[genre as GenreSlug] ?? genre.replace(/_/g, ' ');
  const parents = genre
    .split('_')
    .filter((part) => part !== genre && part in LASTFM_GENRE_TAGS)
    .map((part) => LASTFM_GENRE_TAGS[part as GenreSlug]);
  return [...new Set([own, ...parents])];
}

/** A tag principal do gênero. */
export function lastfmTag(genre: string): string {
  return lastfmTags(genre)[0]!;
}

async function fetchTagTracks(apiKey: string, tag: string, page: number, limit: number, opts: Opts): Promise<TrackRef[]> {
  const url = `${LASTFM}?method=tag.gettoptracks&api_key=${apiKey}&format=json&tag=${encodeURIComponent(tag)}&limit=${limit}&page=${Math.max(1, Math.min(page, 10))}`;
  const data = (await getJson(opts.fetch, url, opts.timeoutMs ?? 5000)) as { error?: unknown; tracks?: { track?: unknown } } | null;
  if (data?.error === 10 || data?.error === 26) throw new LastfmKeyError();
  return refs(data?.tracks?.track, limit);
}

/**
 * As mais ouvidas de um gênero (Last.fm tag.getTopTracks). `page` varia a seleção. Se a tag
 * principal tiver pouca coisa (menos de 60% do pedido), completa com as tags de reserva.
 */
export async function fetchGenreTracks(apiKey: string, genre: string, page: number, limit: number, opts: Opts): Promise<TrackRef[]> {
  if (!KEY_RE.test(apiKey)) throw new LastfmKeyError();
  const out: TrackRef[] = [];
  const seen = new Set<string>();
  for (const tag of lastfmTags(genre)) {
    let list = await fetchTagTracks(apiKey, tag, page, limit, opts);
    // Tag pequena: a página sorteada pode vir vazia; a primeira não.
    if (!list.length && page > 1) list = await fetchTagTracks(apiKey, tag, 1, limit, opts);
    for (const t of list) {
      const key = `${t.artist}|${t.title}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
    if (out.length >= limit * 0.6) break;
  }
  return out.slice(0, limit);
}

/**
 * Gêneros da Deezer (ids do /genre) que a gente usa para conferir se a música é mesmo do
 * gênero pedido. A Deezer classifica pelo álbum e em poucas categorias, então a conferência
 * só descarta o que é claramente de outro gênero (lista de "não é"), nunca exige um.
 */
export const DEEZER_GENRES = {
  pop: 132,
  rapHipHop: 116,
  rock: 152,
  dance: 113,
  rnb: 165,
  alternative: 85,
  electro: 106,
  folk: 466,
  reggae: 144,
  jazz: 129,
  country: 84,
  classical: 98,
  metal: 464,
  soulFunk: 169,
  blues: 153,
  brazilian: 75,
  latin: 197,
  asian: 16,
} as const;

const D = DEEZER_GENRES;
const BR_FUNK_DENY = [D.soulFunk, D.jazz, D.classical, D.metal, D.country, D.rock, D.blues];
const BRAZILIAN_DENY = [D.metal, D.classical, D.asian, D.soulFunk];
/** Gênero do Soundhora → gêneros da Deezer que ele não pode ter. */
const GENRE_DENY: Record<string, number[]> = {
  funk: [D.brazilian, D.latin, D.metal, D.classical, D.country],
  sertanejo: BRAZILIAN_DENY,
  forro: BRAZILIAN_DENY,
  pagode: BRAZILIAN_DENY,
  samba: BRAZILIAN_DENY,
  mpb: BRAZILIAN_DENY,
  bossa_nova: [D.metal, D.asian, D.soulFunk],
  k_pop: [D.brazilian, D.latin, D.country],
  metal: [D.brazilian, D.rnb, D.classical, D.jazz],
  classical: [D.rapHipHop, D.metal, D.dance, D.brazilian],
  jazz: [D.metal, D.rapHipHop, D.brazilian],
};

/** Regras de "não é" do gênero (os subgêneros do funk brasileiro usam as do funk_br). */
function denyFor(genre: string): number[] | null {
  if (genre === 'funk_br' || (genre in LASTFM_TAG_CHAINS && LASTFM_TAG_CHAINS[genre]!.includes('funk carioca'))) return BR_FUNK_DENY;
  return GENRE_DENY[genre] ?? null;
}

/** Este gênero tem conferência na Deezer? (Senão nem vale buscar o gênero do álbum.) */
export function checksDeezerGenre(genre: string): boolean {
  return denyFor(genre) !== null;
}

/**
 * A música (pelos gêneros do álbum na Deezer) pode ser deste gênero? Sem informação da
 * Deezer, ou se algum gênero do álbum não estiver na lista de "não é", aceita.
 */
export function fitsGenre(genre: string, deezerGenreIds: readonly number[] | null | undefined): boolean {
  const deny = denyFor(genre);
  if (!deny || !deezerGenreIds?.length) return true;
  return deezerGenreIds.some((id) => !deny.includes(id));
}

/** Gêneros do álbum na Deezer (/album/{id}). null = não deu para saber. */
export async function deezerAlbumGenres(albumId: string, opts: Opts): Promise<number[] | null> {
  if (!/^\d{1,15}$/.test(albumId)) return null;
  const data = (await getJson(opts.fetch, `${DEEZER}/album/${albumId}`, opts.timeoutMs ?? 5000)) as { genres?: { data?: { id?: unknown }[] }; error?: unknown } | null;
  if (!data || data.error) return null;
  const ids = (data.genres?.data ?? []).map((g) => g.id).filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0);
  return ids.slice(0, 10);
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
  /** Álbum na Deezer (para conferir o gênero). */
  albumId: string | null;
}

interface DeezerHit {
  id?: unknown;
  title?: unknown;
  link?: unknown;
  preview?: unknown;
  artist?: { name?: unknown; picture_medium?: unknown };
  album?: { id?: unknown; title?: unknown; cover_big?: unknown; cover_medium?: unknown };
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
    albumId: typeof hit.album?.id === 'number' || (typeof hit.album?.id === 'string' && /^\d{1,15}$/.test(hit.album.id)) ? String(hit.album!.id) : null,
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
  // As mais tocadas do mundo só entram quando quase não há o que sugerir (conta nova, sem
  // curtidas e com gêneros que o Last.fm não conhece). Antes completavam a pilha toda vez e
  // enchiam de pop o Descobrir de quem escolheu gêneros de nicho.
  if (similar.length + genre.length < Math.min(5, opts.size)) {
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

// ---------------------------------------------------------------- álbuns (Reviews)

/** Álbum da Deezer, para escolher na review. */
export interface DeezerAlbum {
  id: string;
  url: string;
  title: string;
  artist: string;
  imageUrl: string | null;
  /** album, ep, single ou compile (coletânea). */
  recordType: string | null;
  /** Ano de lançamento (só no álbum aberto, /album/{id}; a busca não traz). */
  year: number | null;
  /** Data de lançamento (AAAA-MM-DD), quando a Deezer informa. */
  releaseDate: string | null;
}

interface DeezerAlbumHit {
  id?: unknown;
  title?: unknown;
  link?: unknown;
  cover_big?: unknown;
  cover_medium?: unknown;
  record_type?: unknown;
  release_date?: unknown;
  artist?: { name?: unknown };
  error?: unknown;
}

function toDeezerAlbum(hit: DeezerAlbumHit): DeezerAlbum | null {
  const id = typeof hit.id === 'number' || (typeof hit.id === 'string' && /^\d{1,15}$/.test(hit.id)) ? String(hit.id) : null;
  const title = str(hit.title);
  const artist = str(hit.artist?.name);
  if (!id || !title || !artist) return null;
  const cover = typeof hit.cover_big === 'string' ? hit.cover_big : typeof hit.cover_medium === 'string' ? hit.cover_medium : null;
  const date = typeof hit.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hit.release_date) && hit.release_date !== '0000-00-00' ? hit.release_date : null;
  const year = date ? Number(date.slice(0, 4)) : null;
  return {
    id,
    url: `https://www.deezer.com/album/${id}`,
    title,
    artist,
    imageUrl: safeImageUrl(cover),
    recordType: typeof hit.record_type === 'string' && /^[a-z]{2,12}$/.test(hit.record_type) ? hit.record_type : null,
    year: year && year >= 1900 && year <= 2100 ? year : null,
    releaseDate: year && year >= 1900 && year <= 2100 ? date : null,
  };
}

/** Busca álbuns pelo nome (e/ou artista) na Deezer. 'quota' = esperar um pouco. */
export async function searchDeezerAlbums(query: string, opts: Opts, limit = 15): Promise<DeezerAlbum[] | 'quota'> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 100);
  if (q.length < 2) return [];
  const data = (await getJson(opts.fetch, `${DEEZER}/search/album?q=${encodeURIComponent(q)}&limit=${Math.min(Math.max(limit, 1), 25)}`, opts.timeoutMs ?? 5000)) as {
    data?: DeezerAlbumHit[];
    error?: { code?: unknown };
  } | null;
  if (data?.error?.code === 4) return 'quota';
  const out: DeezerAlbum[] = [];
  for (const hit of Array.isArray(data?.data) ? data.data : []) {
    const album = toDeezerAlbum(hit);
    if (album && !out.some((a) => a.id === album.id)) out.push(album);
  }
  return out;
}

/** O álbum da Deezer pelo id, com o ano de lançamento. */
export async function deezerAlbumById(id: string, opts: Opts): Promise<DeezerAlbum | null> {
  if (!/^\d{1,15}$/.test(id)) return null;
  const hit = (await getJson(opts.fetch, `${DEEZER}/album/${id}`, opts.timeoutMs ?? 5000)) as DeezerAlbumHit | null;
  if (!hit || hit.error) return null;
  return toDeezerAlbum(hit);
}

// ---------------------------------------------------------------- músicas favoritas (Perfil)

/** Busca músicas pelo nome e/ou artista na Deezer (para escolher as favoritas). 'quota' = esperar. */
export async function searchDeezerTracks(query: string, opts: Opts, limit = 15): Promise<DeezerTrack[] | 'quota'> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 100);
  if (q.length < 2) return [];
  const data = (await getJson(opts.fetch, `${DEEZER}/search?q=${encodeURIComponent(q)}&limit=${Math.min(Math.max(limit, 1), 25)}`, opts.timeoutMs ?? 5000)) as {
    data?: DeezerHit[];
    error?: { code?: unknown };
  } | null;
  if (data?.error?.code === 4) return 'quota';
  const out: DeezerTrack[] = [];
  for (const hit of Array.isArray(data?.data) ? data.data : []) {
    const track = toDeezerTrack(hit, { title: '', artist: '' });
    if (track && track.title && track.artist && !out.some((t) => t.id === track.id)) out.push(track);
  }
  return out;
}
