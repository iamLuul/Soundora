// ARQUIVO GERADO por scripts/sync-shared.mjs a partir de packages/core/src/links. Não edite aqui.
/**
 * Indexador de links: transforma um link de streaming em um cartão de prévia
 * (título, artista, capa). Usa só fontes públicas, sem login do usuário:
 * oEmbed, APIs públicas (Deezer, iTunes Lookup) e metadados Open Graph.
 *
 * O `fetch` é injetado para que os testes rodem sem rede e para que a Edge
 * Function aplique os mesmos limites de segurança.
 */
import { isAllowedFetchHost, parseStreamingUrl, safeImageUrl, type LinkKind, type ParsedLink, type Platform } from './platforms.ts';

export interface LinkPreview {
  platform: Platform;
  kind: LinkKind;
  /** URL de origem. É ela que abre no play. */
  url: string;
  providerId: string | null;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

export type LinkPreviewErrorCode = 'unsupported' | 'not_found' | 'fetch_failed' | 'blocked_host';

export class LinkPreviewError extends Error {
  constructor(
    public readonly code: LinkPreviewErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LinkPreviewError';
  }
}

export type FetchLike = (input: string, init?: { redirect?: 'manual' | 'follow'; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface PreviewOptions {
  fetch: FetchLike;
  /** Tempo máximo por requisição, em ms. */
  timeoutMs?: number;
  /** Tamanho máximo de HTML lido para Open Graph, em caracteres. */
  maxHtmlChars?: number;
}

const USER_AGENT = 'SoundoraBot/0.1 (+https://soundora.app/bot)';
const MAX_REDIRECTS = 5;

function limit(text: string | null | undefined, max = 200): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

async function safeFetch(url: string, opts: PreviewOptions, accept = 'application/json') {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !isAllowedFetchHost(parsed.hostname)) {
    throw new LinkPreviewError('blocked_host', parsed.hostname);
  }
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  try {
    return await opts.fetch(url, { redirect: 'manual', headers: { 'user-agent': USER_AGENT, accept }, signal });
  } catch (err) {
    throw new LinkPreviewError('fetch_failed', String(err));
  }
}

/**
 * Faz a requisição seguindo redirecionamentos (até 5), mas validando cada destino
 * contra a lista de hosts permitidos. Muitas plataformas redirecionam (idioma, www, região).
 */
async function fetchFollowing(url: string, opts: PreviewOptions, accept: string) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await safeFetch(current, opts, accept);
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  throw new LinkPreviewError('fetch_failed', 'too many redirects');
}

async function getJson<T>(url: string, opts: PreviewOptions): Promise<T> {
  const res = await fetchFollowing(url, opts, 'application/json');
  if (res.status === 404) throw new LinkPreviewError('not_found');
  if (!res.ok) throw new LinkPreviewError('fetch_failed', `HTTP ${res.status}`);
  try {
    return JSON.parse(await res.text()) as T;
  } catch {
    throw new LinkPreviewError('fetch_failed', 'invalid json');
  }
}

/** Segue um link curto, validando cada salto contra a lista de hosts permitidos. */
export async function resolveShortLink(url: string, opts: PreviewOptions): Promise<ParsedLink> {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const res = await safeFetch(current, opts, 'text/html');
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) {
      // Alguns encurtadores devolvem uma página (200) em vez de redirecionar:
      // procura o link da plataforma no og:url ou no próprio HTML.
      if (res.ok) {
        const html = (await res.text()).slice(0, opts.maxHtmlChars ?? 500_000);
        const candidates = [parseOpenGraph(html)['og:url'], ...(html.match(/https:\/\/[a-z0-9.-]+\/[^\s"'<>\\]+/gi) ?? [])];
        for (const c of candidates) {
          const parsed = c ? parseStreamingUrl(decodeEntities(c)) : null;
          if (parsed && !parsed.isShortLink) return parsed;
        }
      }
      break;
    }
    current = new URL(location, current).toString();
    const parsed = parseStreamingUrl(current);
    if (parsed && !parsed.isShortLink) return parsed;
  }
  throw new LinkPreviewError('unsupported', 'short link did not resolve to a supported page');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z#0-9]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Lê as tags <meta property="og:*"> de um HTML. */
export function parseOpenGraph(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (key && content !== undefined && !(key in out)) out[key] = decodeEntities(content);
  }
  return out;
}

async function openGraph(url: string, opts: PreviewOptions): Promise<Record<string, string>> {
  const res = await fetchFollowing(url, opts, 'text/html');
  if (res.status === 404) throw new LinkPreviewError('not_found');
  if (!res.ok) throw new LinkPreviewError('fetch_failed', `HTTP ${res.status}`);
  const html = (await res.text()).slice(0, opts.maxHtmlChars ?? 500_000);
  return parseOpenGraph(html);
}

function fromOpenGraph(link: ParsedLink, og: Record<string, string>): LinkPreview {
  const title = limit(og['og:title']);
  if (!title) throw new LinkPreviewError('not_found', 'page has no og:title');
  return {
    platform: link.platform,
    kind: link.kind,
    url: link.url,
    providerId: link.id,
    title,
    artist: null, // Open Graph não traz o artista de forma confiável
    imageUrl: og['og:image'] ?? null,
  };
}

/**
 * Tira o artista do og:description do Spotify.
 * Faixa: "Listen to X on Spotify. Song · Artista · 2021"
 * Álbum: "Listen to X on Spotify. Artista · Album · 2021 · 12 songs."
 */
export function spotifyArtistFromDescription(description: string | undefined): string | null {
  if (!description) return null;
  const parts = description.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0]!.split(/\.\s+/).pop() ?? '';
  if (/^(song|música|canción|single)$/i.test(first)) return limit(parts[1]);
  if (/^(album|álbum|ep|single|compilation|compilação)$/i.test(parts[1]!)) return limit(first);
  return null;
}

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

async function spotify(link: ParsedLink, opts: PreviewOptions): Promise<LinkPreview> {
  let data: OEmbed;
  try {
    data = await getJson<OEmbed>(`https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`, opts);
  } catch (err) {
    if (err instanceof LinkPreviewError && err.code === 'not_found') throw err;
    // oEmbed fora do ar ou bloqueado: tenta os metadados da própria página.
    const og = await openGraph(link.url, opts);
    return { ...fromOpenGraph(link, og), artist: spotifyArtistFromDescription(og['og:description']) };
  }
  const title = limit(data.title);
  if (!title) throw new LinkPreviewError('not_found');
  let artist: string | null = null;
  if (link.kind === 'track' || link.kind === 'album') {
    try {
      artist = spotifyArtistFromDescription((await openGraph(link.url, opts))['og:description']);
    } catch {
      artist = null; // o artista é opcional no cartão
    }
  }
  return { platform: 'spotify', kind: link.kind, url: link.url, providerId: link.id, title, artist, imageUrl: data.thumbnail_url ?? null };
}

async function youtube(link: ParsedLink, opts: PreviewOptions): Promise<LinkPreview> {
  const target =
    link.kind === 'playlist' || link.kind === 'album'
      ? `https://www.youtube.com/playlist?list=${link.id}`
      : `https://www.youtube.com/watch?v=${link.id}`;
  const data = await getJson<OEmbed>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target)}`, opts);
  const title = limit(data.title);
  if (!title) throw new LinkPreviewError('not_found');
  return {
    platform: link.platform,
    kind: link.kind,
    url: link.url,
    providerId: link.id,
    title,
    artist: limit(data.author_name?.replace(/ - Topic$/, '')),
    imageUrl: data.thumbnail_url ?? null,
  };
}

async function soundcloud(link: ParsedLink, opts: PreviewOptions): Promise<LinkPreview> {
  const data = await getJson<OEmbed>(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link.url)}`, opts);
  const author = limit(data.author_name);
  let title = limit(data.title);
  if (!title) throw new LinkPreviewError('not_found');
  // oEmbed devolve "Faixa by Artista"
  if (author && title.endsWith(` by ${author}`)) title = title.slice(0, -` by ${author}`.length);
  return { platform: 'soundcloud', kind: link.kind, url: link.url, providerId: link.id, title, artist: author, imageUrl: data.thumbnail_url ?? null };
}

interface DeezerItem {
  error?: unknown;
  title?: string;
  name?: string;
  artist?: { name?: string };
  creator?: { name?: string };
  album?: { cover_xl?: string };
  cover_xl?: string;
  picture_xl?: string;
}

async function deezer(link: ParsedLink, opts: PreviewOptions): Promise<LinkPreview> {
  const data = await getJson<DeezerItem>(`https://api.deezer.com/${link.kind}/${link.id}`, opts);
  if (data.error) throw new LinkPreviewError('not_found');
  const title = limit(data.title ?? data.name);
  if (!title) throw new LinkPreviewError('not_found');
  return {
    platform: 'deezer',
    kind: link.kind,
    url: link.url,
    providerId: link.id,
    title,
    artist: limit(data.artist?.name ?? data.creator?.name ?? null),
    imageUrl: data.album?.cover_xl ?? data.cover_xl ?? data.picture_xl ?? null,
  };
}

interface ITunesLookup {
  resultCount: number;
  results: Array<{ trackName?: string; collectionName?: string; artistName?: string; artworkUrl100?: string }>;
}

async function appleMusic(link: ParsedLink, opts: PreviewOptions): Promise<LinkPreview> {
  if (link.kind === 'playlist') return fromOpenGraph(link, await openGraph(link.url, opts));
  const data = await getJson<ITunesLookup>(`https://itunes.apple.com/lookup?id=${link.id}`, opts);
  const item = data.results[0];
  if (!item) throw new LinkPreviewError('not_found');
  const title = limit(link.kind === 'artist' ? item.artistName : (item.trackName ?? item.collectionName));
  if (!title) throw new LinkPreviewError('not_found');
  return {
    platform: 'apple_music',
    kind: link.kind,
    url: link.url,
    providerId: link.id,
    title,
    artist: link.kind === 'artist' ? null : limit(item.artistName),
    imageUrl: item.artworkUrl100?.replace(/100x100bb/, '600x600bb') ?? null,
  };
}

async function genericOpenGraph(link: ParsedLink, opts: PreviewOptions): Promise<LinkPreview> {
  const og = await openGraph(link.url, opts);
  const preview = fromOpenGraph(link, og);
  // Bandcamp: og:title = "Faixa, by Artista"
  if (link.platform === 'bandcamp') {
    const m = preview.title.match(/^(.*), by (.*)$/);
    if (m) return { ...preview, title: m[1]!.trim(), artist: limit(m[2]) };
  }
  return preview;
}

const PROVIDERS: Record<Platform, (link: ParsedLink, opts: PreviewOptions) => Promise<LinkPreview>> = {
  spotify,
  apple_music: appleMusic,
  deezer,
  youtube_music: youtube,
  youtube,
  soundcloud,
  tidal: genericOpenGraph,
  amazon_music: genericOpenGraph,
  bandcamp: genericOpenGraph,
};

/** Gera o cartão de prévia para um link colado. */
export async function buildLinkPreview(input: string, opts: PreviewOptions): Promise<LinkPreview> {
  let link = parseStreamingUrl(input);
  if (!link) throw new LinkPreviewError('unsupported');
  if (link.isShortLink) link = await resolveShortLink(link.url, opts);
  const preview = await PROVIDERS[link.platform](link, opts);
  return { ...preview, imageUrl: safeImageUrl(preview.imageUrl) };
}
