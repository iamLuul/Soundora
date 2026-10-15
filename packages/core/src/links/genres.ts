// Gêneros de uma música a partir dos metadados públicos das lojas (sem chave de API):
//   1. iTunes Search (Apple): "primaryGenreName" da faixa
//   2. Deezer: gêneros do álbum da faixa
// Os nomes das lojas viram os gêneros do Soundhora (slugs da tabela public.genres).
// Só fala com esses dois endereços fixos; qualquer falha devolve lista vazia.
import type { FetchLike } from './preview.ts';

/** Gêneros do Soundhora (mesmos slugs de supabase/seed.sql). */
export const GENRE_SLUGS = [
  'acoustic', 'alternative', 'ambient', 'anime', 'blues', 'bossa_nova', 'classical', 'country', 'dance',
  'drum_and_bass', 'electronic', 'emo', 'folk', 'forro', 'funk_br', 'gospel', 'hip_hop', 'house', 'indie',
  'jazz', 'k_pop', 'latin', 'lo_fi', 'metal', 'mpb', 'pagode', 'pop', 'punk', 'r_and_b', 'reggae', 'rock',
  'samba', 'sertanejo', 'shoegaze', 'soul', 'techno', 'trap',
] as const;
export type GenreSlug = (typeof GENRE_SLUGS)[number];

/** Máximo de gêneros num post. */
export const MAX_POST_GENRES = 3;

// Nome da loja (minúsculo, sem acento) → gênero do Soundhora. Testado na ordem: o primeiro
// trecho encontrado vence (ex.: "funk carioca" → funk_br antes de "funk" → soul).
const RULES: [RegExp, GenreSlug][] = [
  [/k-?pop/, 'k_pop'],
  [/anime|j-?pop|j-?rock|soundtrack.*anime/, 'anime'],
  [/bossa/, 'bossa_nova'],
  [/sertanej/, 'sertanejo'],
  [/forro|xote|baiao/, 'forro'],
  [/pagode/, 'pagode'],
  [/samba/, 'samba'],
  [/\bmpb\b|musica (popular )?brasileira|brazilian( music)?$|^brasileira$/, 'mpb'],
  [/funk (carioca|brasileiro|br)|baile funk|brazilian funk|funk$/, 'funk_br'],
  [/gospel|christian|worship|crista/, 'gospel'],
  [/trap/, 'trap'],
  [/hip.?hop|rap/, 'hip_hop'],
  [/r&b|r and b|rnb|rhythm and blues/, 'r_and_b'],
  [/soul|funk/, 'soul'],
  [/shoegaze|dream ?pop/, 'shoegaze'],
  [/emo/, 'emo'],
  [/punk/, 'punk'],
  [/metal|hard ?core/, 'metal'],
  [/indie/, 'indie'],
  [/alternativ/, 'alternative'],
  [/rock/, 'rock'],
  [/lo-?fi|chillhop/, 'lo_fi'],
  [/drum ?(&|and|n) ?bass|dnb|jungle/, 'drum_and_bass'],
  [/techno/, 'techno'],
  [/house/, 'house'],
  [/ambient|new age/, 'ambient'],
  [/dance|disco|edm/, 'dance'],
  [/electro|eletron|electronica/, 'electronic'],
  [/reggae|dancehall|ska/, 'reggae'],
  [/latin|reggaeton|salsa|bachata|cumbia/, 'latin'],
  [/jazz/, 'jazz'],
  [/blues/, 'blues'],
  [/country|americana/, 'country'],
  [/folk|singer.?songwriter|cantautor/, 'folk'],
  [/acoustic|acustic/, 'acoustic'],
  [/classical|classica|orchestr|opera/, 'classical'],
  [/pop/, 'pop'],
];

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Nome de gênero de uma loja → gênero do Soundhora (ou null). */
export function mapStoreGenre(name: string): GenreSlug | null {
  const n = normalize(name);
  if (!n) return null;
  for (const [re, slug] of RULES) if (re.test(n)) return slug;
  return null;
}

/** Vários nomes → gêneros sem repetir, na ordem, até o máximo do post. */
export function mapStoreGenres(names: string[]): GenreSlug[] {
  const out: GenreSlug[] = [];
  for (const name of names) {
    const slug = mapStoreGenre(name);
    if (slug && !out.includes(slug)) out.push(slug);
    if (out.length >= MAX_POST_GENRES) break;
  }
  return out;
}

const ITUNES = 'https://itunes.apple.com/search';
const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
const DEEZER = 'https://api.deezer.com';

async function getJson(fetchFn: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 200_000) return null; // resposta grande demais: ignora
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Onde a música está (para achar a faixa exata nas lojas quando o link é da própria loja). */
export interface StoreRef {
  title: string;
  artist: string | null;
  platform?: string;
  kind?: string;
  providerId?: string | null;
}

export interface StoreInfo {
  /** Nomes de gênero das lojas (ainda não convertidos). */
  genreNames: string[];
  /** Prévia de 30 s oficial da loja (Apple ou Deezer), ou null. */
  audioUrl: string | null;
}

/** Só prévias servidas pelos próprios CDNs da Apple e da Deezer. */
const AUDIO_HOSTS = /(^|\.)(mzstatic\.com|itunes\.apple\.com|dzcdn\.net)$/;

export function isAllowedAudioUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 2000) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && AUDIO_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

const plain = (s: string) =>
  normalize(s)
    .replace(/\s*[([].*?[)\]]\s*/g, ' ') // (Remastered 2011), [Live]
    .replace(/\s+-\s+.*$/, '') // "Faixa - Ao Vivo"
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A faixa achada na loja é a mesma do link? (título e artista batem, sem ligar para versão/acento). */
export function sameTrack(ref: { title: string; artist: string | null }, found: { title?: unknown; artist?: unknown }): boolean {
  if (typeof found.title !== 'string') return false;
  const a = plain(ref.title);
  const b = plain(found.title);
  if (!a || !b || !(a.includes(b) || b.includes(a))) return false;
  if (!ref.artist) return true;
  if (typeof found.artist !== 'string') return false;
  const x = plain(ref.artist);
  const y = plain(found.artist);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

interface ItunesSong {
  trackName?: unknown;
  artistName?: unknown;
  primaryGenreName?: unknown;
  previewUrl?: unknown;
}
interface DeezerTrack {
  title?: unknown;
  artist?: { name?: unknown };
  preview?: unknown;
  album?: { id?: unknown };
}

/**
 * Gêneros e prévia de 30 s da música nas lojas, pelos endereços públicos (sem chave):
 * Apple (iTunes Search/Lookup) e Deezer. Link da própria loja: busca a faixa exata pelo id.
 * A prévia só é aceita se a faixa achada for a mesma (título e artista batem).
 */
export async function lookupStore(ref: StoreRef, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<StoreInfo> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const { title, artist } = ref;
  const term = [artist, title].filter(Boolean).join(' ').slice(0, 200);
  if (!term.trim()) return { genreNames: [], audioUrl: null };
  const names: string[] = [];
  let audioUrl: string | null = null;
  const exactId = (re: RegExp) => (ref.kind === 'track' && ref.providerId && re.test(ref.providerId) ? ref.providerId : null);

  // Apple: faixa exata (link do Apple Music) ou busca.
  const appleId = ref.platform === 'apple_music' ? exactId(/^\d{1,15}$/) : null;
  const itunes = (await getJson(
    opts.fetch,
    appleId ? `${ITUNES_LOOKUP}?entity=song&id=${appleId}` : `${ITUNES}?entity=song&limit=5&term=${encodeURIComponent(term)}`,
    timeoutMs,
  )) as { results?: ItunesSong[] } | null;
  const songs = (itunes?.results ?? []).filter((r) => r && typeof r === 'object');
  const primary = songs[0]?.primaryGenreName;
  if (typeof primary === 'string') names.push(primary);
  const appleMatch = appleId ? songs.find((r) => typeof r.trackName === 'string') : songs.find((r) => sameTrack(ref, { title: r.trackName, artist: r.artistName }));
  if (appleMatch && isAllowedAudioUrl(appleMatch.previewUrl)) audioUrl = appleMatch.previewUrl;

  // Deezer: faixa exata (link da Deezer) ou busca.
  const deezerId = ref.platform === 'deezer' ? exactId(/^\d{1,15}$/) : null;
  let track: DeezerTrack | null = null;
  if (deezerId) {
    track = (await getJson(opts.fetch, `${DEEZER}/track/${deezerId}`, timeoutMs)) as DeezerTrack | null;
  } else {
    const q = artist ? `artist:"${artist}" track:"${title}"` : title;
    const search = (await getJson(opts.fetch, `${DEEZER}/search?limit=1&q=${encodeURIComponent(q.slice(0, 200))}`, timeoutMs)) as { data?: DeezerTrack[] } | null;
    track = search?.data?.[0] ?? null;
  }
  const albumId = track?.album?.id;
  if (typeof albumId === 'number' && Number.isSafeInteger(albumId)) {
    const album = (await getJson(opts.fetch, `${DEEZER}/album/${albumId}`, timeoutMs)) as { genres?: { data?: { name?: unknown }[] } } | null;
    for (const g of album?.genres?.data ?? []) if (typeof g.name === 'string') names.push(g.name);
  }
  // A prévia da Apple vem primeiro (o link não vence); a da Deezer vence em algumas horas.
  if (!audioUrl && track && (deezerId || sameTrack(ref, { title: track.title, artist: track.artist?.name })) && isAllowedAudioUrl(track.preview)) {
    audioUrl = track.preview;
  }
  return { genreNames: names.slice(0, 10), audioUrl };
}

/** Nomes de gênero que a Apple e a Deezer dão para a faixa (ou álbum). */
export async function lookupStoreGenres(title: string, artist: string | null, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<string[]> {
  return (await lookupStore({ title, artist }, opts)).genreNames;
}

/** Gêneros do Soundhora detectados para a música (lista vazia se não achar). */
export async function detectGenres(title: string, artist: string | null, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<GenreSlug[]> {
  return mapStoreGenres(await lookupStoreGenres(title, artist, opts));
}

/** Gêneros do Soundhora e prévia de 30 s da música. */
export async function detectStoreInfo(ref: StoreRef, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<{ genres: GenreSlug[]; audioUrl: string | null }> {
  const info = await lookupStore(ref, opts);
  return { genres: mapStoreGenres(info.genreNames), audioUrl: info.audioUrl };
}
