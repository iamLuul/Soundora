// ARQUIVO GERADO por scripts/sync-shared.mjs a partir de packages/core/src/links. Não edite aqui.
// Gêneros de uma música a partir dos metadados públicos das lojas (sem chave de API):
//   1. iTunes Search (Apple): "primaryGenreName" da faixa
//   2. Deezer: gêneros do álbum da faixa
// Os nomes das lojas viram os gêneros do Soundora (slugs da tabela public.genres).
// Só fala com esses dois endereços fixos; qualquer falha devolve lista vazia.
import type { FetchLike } from './preview.ts';

/** Gêneros do Soundora (mesmos slugs de supabase/seed.sql). */
export const GENRE_SLUGS = [
  'acoustic', 'alternative', 'ambient', 'anime', 'blues', 'bossa_nova', 'classical', 'country', 'dance',
  'drum_and_bass', 'electronic', 'emo', 'folk', 'forro', 'funk_br', 'gospel', 'hip_hop', 'house', 'indie',
  'jazz', 'k_pop', 'latin', 'lo_fi', 'metal', 'mpb', 'pagode', 'pop', 'punk', 'r_and_b', 'reggae', 'rock',
  'samba', 'sertanejo', 'shoegaze', 'soul', 'techno', 'trap',
] as const;
export type GenreSlug = (typeof GENRE_SLUGS)[number];

/** Máximo de gêneros num post. */
export const MAX_POST_GENRES = 3;

// Nome da loja (minúsculo, sem acento) → gênero do Soundora. Testado na ordem: o primeiro
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

/** Nome de gênero de uma loja → gênero do Soundora (ou null). */
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

/** Nomes de gênero que a Apple e a Deezer dão para a faixa (ou álbum). */
export async function lookupStoreGenres(
  title: string,
  artist: string | null,
  opts: { fetch: FetchLike; timeoutMs?: number },
): Promise<string[]> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const term = [artist, title].filter(Boolean).join(' ').slice(0, 200);
  if (!term.trim()) return [];
  const names: string[] = [];

  const itunes = (await getJson(opts.fetch, `${ITUNES}?entity=song&limit=1&term=${encodeURIComponent(term)}`, timeoutMs)) as {
    results?: { primaryGenreName?: unknown }[];
  } | null;
  const primary = itunes?.results?.[0]?.primaryGenreName;
  if (typeof primary === 'string') names.push(primary);

  const q = artist ? `artist:"${artist}" track:"${title}"` : title;
  const search = (await getJson(opts.fetch, `${DEEZER}/search?limit=1&q=${encodeURIComponent(q.slice(0, 200))}`, timeoutMs)) as {
    data?: { album?: { id?: unknown } }[];
  } | null;
  const albumId = search?.data?.[0]?.album?.id;
  if (typeof albumId === 'number' && Number.isSafeInteger(albumId)) {
    const album = (await getJson(opts.fetch, `${DEEZER}/album/${albumId}`, timeoutMs)) as { genres?: { data?: { name?: unknown }[] } } | null;
    for (const g of album?.genres?.data ?? []) if (typeof g.name === 'string') names.push(g.name);
  }
  return names.slice(0, 10);
}

/** Gêneros do Soundora detectados para a música (lista vazia se não achar). */
export async function detectGenres(title: string, artist: string | null, opts: { fetch: FetchLike; timeoutMs?: number }): Promise<GenreSlug[]> {
  return mapStoreGenres(await lookupStoreGenres(title, artist, opts));
}
