// ARQUIVO GERADO por scripts/sync-shared.mjs a partir de packages/core/src/links. Não edite aqui.
/**
 * Reconhece links de plataformas de streaming e os normaliza.
 *
 * Este arquivo não tem dependências e roda igual no app (Metro), nos testes
 * (Vitest) e na Edge Function do Supabase (Deno). Ele é copiado para
 * supabase/functions/_shared/links pelo script `npm run sync:shared`.
 */

export type Platform =
  | 'spotify'
  | 'apple_music'
  | 'deezer'
  | 'youtube_music'
  | 'youtube'
  | 'soundcloud'
  | 'tidal'
  | 'amazon_music'
  | 'bandcamp';

export type LinkKind = 'track' | 'album' | 'artist' | 'playlist' | 'video' | 'unknown';

export interface ParsedLink {
  platform: Platform;
  kind: LinkKind;
  /** Identificador na plataforma, quando o link traz um. */
  id: string | null;
  /** URL limpa (https, sem parâmetros de rastreamento), usada no botão de play. */
  url: string;
  /** Link curto que precisa seguir redirecionamentos antes de ser lido. */
  isShortLink: boolean;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  deezer: 'Deezer',
  youtube_music: 'YouTube Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  tidal: 'TIDAL',
  amazon_music: 'Amazon Music',
  bandcamp: 'Bandcamp',
};

/**
 * Domínios do Amazon Music, um por país. Lista fechada: uma regra como
 * `music.amazon.*` aceitaria `music.amazon.site-qualquer.com` (SSRF).
 */
export const AMAZON_MUSIC_HOSTS = new Set([
  'music.amazon.com',
  'music.amazon.com.br',
  'music.amazon.co.uk',
  'music.amazon.de',
  'music.amazon.fr',
  'music.amazon.it',
  'music.amazon.es',
  'music.amazon.ca',
  'music.amazon.com.mx',
  'music.amazon.co.jp',
  'music.amazon.in',
  'music.amazon.com.au',
]);

/** Domínios de link curto e a plataforma a que pertencem. */
export const SHORT_LINK_HOSTS: Record<string, Platform> = {
  'spotify.link': 'spotify',
  'link.deezer.com': 'deezer',
  'deezer.page.link': 'deezer',
  'on.soundcloud.com': 'soundcloud',
  'tidal.link': 'tidal',
};

const KINDS: Record<string, LinkKind> = {
  track: 'track',
  song: 'track',
  tracks: 'track',
  album: 'album',
  albums: 'album',
  artist: 'artist',
  artists: 'artist',
  playlist: 'playlist',
  playlists: 'playlist',
  sets: 'playlist',
};

/** Extrai a primeira URL http(s) de um texto colado pela pessoa. */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  // Remove pontuação colada no fim ("ouve isso: https://...!")
  return match[0].replace(/[),.!?;:]+$/, '');
}

function toUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.protocol = 'https:';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
}

function segments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function clean(url: URL, keep: string[] = []): string {
  const out = new URL(url.origin + url.pathname.replace(/\/+$/, ''));
  for (const key of keep) {
    const value = url.searchParams.get(key);
    if (value) out.searchParams.set(key, value);
  }
  return out.toString();
}

/**
 * Lê um link de streaming. Devolve `null` quando o link não é de uma
 * plataforma suportada.
 */
export function parseStreamingUrl(input: string): ParsedLink | null {
  const url = toUrl(input);
  if (!url) return null;
  const h = host(url);
  const parts = segments(url);

  const short = SHORT_LINK_HOSTS[h];
  if (short) {
    if (parts.length === 0) return null;
    return { platform: short, kind: 'unknown', id: null, url: clean(url), isShortLink: true };
  }

  // Spotify: open.spotify.com/intl-pt/track/{id}
  if (h === 'open.spotify.com') {
    const p = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
    const kind = KINDS[p[0] ?? ''];
    const id = p[1];
    if (!kind || !id || !/^[A-Za-z0-9]{22}$/.test(id)) return null;
    return {
      platform: 'spotify',
      kind,
      id,
      url: `https://open.spotify.com/${p[0]}/${id}`,
      isShortLink: false,
    };
  }

  // Apple Music: music.apple.com/br/album/nome/123?i=456  |  /song/nome/456
  if (h === 'music.apple.com') {
    const p = /^[a-z]{2}$/.test(parts[0] ?? '') ? parts.slice(1) : parts;
    const type = p[0] ?? '';
    const id = p[p.length - 1] ?? '';
    const trackId = url.searchParams.get('i');
    if (type === 'album' && trackId && /^\d+$/.test(trackId)) {
      return { platform: 'apple_music', kind: 'track', id: trackId, url: clean(url, ['i']), isShortLink: false };
    }
    const kind = KINDS[type];
    if (!kind) return null;
    const validId = kind === 'playlist' ? /^pl\.[A-Za-z0-9-]+$/.test(id) : /^\d+$/.test(id);
    if (!validId) return null;
    return { platform: 'apple_music', kind, id, url: clean(url), isShortLink: false };
  }

  // Deezer: deezer.com/br/track/123
  if (h === 'deezer.com') {
    const p = /^[a-z]{2}$/.test(parts[0] ?? '') ? parts.slice(1) : parts;
    const kind = KINDS[p[0] ?? ''];
    const id = p[1];
    if (!kind || !id || !/^\d+$/.test(id)) return null;
    return { platform: 'deezer', kind, id, url: `https://www.deezer.com/${p[0]}/${id}`, isShortLink: false };
  }

  // YouTube Music: music.youtube.com/watch?v=ID  |  /playlist?list=ID
  if (h === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (parts[0] === 'watch' && v && /^[\w-]{11}$/.test(v)) {
      return { platform: 'youtube_music', kind: 'track', id: v, url: `https://music.youtube.com/watch?v=${v}`, isShortLink: false };
    }
    const list = url.searchParams.get('list');
    if (parts[0] === 'playlist' && list) {
      const kind: LinkKind = list.startsWith('OLAK5uy_') ? 'album' : 'playlist';
      return { platform: 'youtube_music', kind, id: list, url: `https://music.youtube.com/playlist?list=${list}`, isShortLink: false };
    }
    if (parts[0] === 'channel' && parts[1]) {
      return { platform: 'youtube_music', kind: 'artist', id: parts[1], url: clean(url), isShortLink: false };
    }
    return null;
  }

  // YouTube: youtube.com/watch?v=ID  |  youtu.be/ID
  if (h === 'youtube.com' || h === 'youtu.be') {
    const v = h === 'youtu.be' ? parts[0] : parts[0] === 'watch' ? url.searchParams.get('v') : parts[0] === 'shorts' ? parts[1] : null;
    if (!v || !/^[\w-]{11}$/.test(v)) return null;
    return { platform: 'youtube', kind: 'video', id: v, url: `https://www.youtube.com/watch?v=${v}`, isShortLink: false };
  }

  // SoundCloud: soundcloud.com/artista/faixa  |  /artista/sets/album
  if (h === 'soundcloud.com') {
    if (parts.length === 0) return null;
    const reserved = ['discover', 'search', 'you', 'stream', 'upload', 'pages', 'charts'];
    if (reserved.includes(parts[0] ?? '')) return null;
    const kind: LinkKind = parts.length === 1 ? 'artist' : parts[1] === 'sets' ? 'playlist' : 'track';
    const path = parts.slice(0, kind === 'playlist' ? 3 : kind === 'track' ? 2 : 1).join('/');
    return { platform: 'soundcloud', kind, id: path, url: `https://soundcloud.com/${path}`, isShortLink: false };
  }

  // TIDAL: tidal.com/browse/track/123  |  listen.tidal.com/album/123
  if (h === 'tidal.com' || h === 'listen.tidal.com') {
    const p = parts[0] === 'browse' ? parts.slice(1) : parts;
    const kind = KINDS[p[0] ?? ''];
    const id = p[1];
    if (!kind || !id) return null;
    return { platform: 'tidal', kind, id, url: `https://tidal.com/browse/${p[0]}/${id}`, isShortLink: false };
  }

  // Amazon Music: music.amazon.com.br/albums/B0..?trackAsin=B0..
  if (AMAZON_MUSIC_HOSTS.has(h)) {
    const trackAsin = url.searchParams.get('trackAsin');
    if (parts[0] === 'albums' && trackAsin) {
      return { platform: 'amazon_music', kind: 'track', id: trackAsin, url: clean(url, ['trackAsin']), isShortLink: false };
    }
    const kind = KINDS[parts[0] ?? ''];
    const id = parts[1];
    if (!kind || !id) return null;
    return { platform: 'amazon_music', kind, id, url: clean(url), isShortLink: false };
  }

  // Bandcamp: artista.bandcamp.com/track/nome
  if (h.endsWith('.bandcamp.com') && h !== 'bandcamp.com') {
    const kind = KINDS[parts[0] ?? ''] ?? (parts.length === 0 ? 'artist' : null);
    if (!kind) return null;
    const id = parts.length ? `${h}/${parts.slice(0, 2).join('/')}` : h;
    return { platform: 'bandcamp', kind, id, url: clean(url), isShortLink: false };
  }

  return null;
}

/** Hosts para os quais o servidor pode fazer requisições (proteção contra SSRF). */
export function isAllowedFetchHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const exact = new Set([
    'open.spotify.com',
    'music.apple.com',
    'itunes.apple.com',
    'www.deezer.com',
    'deezer.com',
    'api.deezer.com',
    'music.youtube.com',
    'www.youtube.com',
    'youtube.com',
    'youtu.be',
    'soundcloud.com',
    'tidal.com',
    'listen.tidal.com',
    'oembed.tidal.com',
    ...Object.keys(SHORT_LINK_HOSTS),
  ]);
  if (exact.has(h)) return true;
  if (AMAZON_MUSIC_HOSTS.has(h)) return true;
  // Subdomínio de artista do Bandcamp (artista.bandcamp.com): o DNS é do Bandcamp.
  if (/^[a-z0-9-]+\.bandcamp\.com$/.test(h)) return true;
  return false;
}

/** CDNs de capa das plataformas. Capa de outro domínio é descartada (evita rastrear o IP de quem vê o post). */
const IMAGE_HOST_SUFFIXES = [
  'scdn.co', // Spotify
  'spotifycdn.com',
  'mzstatic.com', // Apple
  'dzcdn.net', // Deezer
  'ytimg.com', // YouTube
  'ggpht.com',
  'googleusercontent.com', // YouTube Music
  'sndcdn.com', // SoundCloud
  'tidal.com', // TIDAL (resources.tidal.com)
  'media-amazon.com', // Amazon
  'ssl-images-amazon.com',
  'bcbits.com', // Bandcamp
  'lastfm.freetls.fastly.net', // capas do Last.fm (só esse host da Fastly)
];

export function isAllowedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return IMAGE_HOST_SUFFIXES.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Devolve a URL da capa só se for https e de um CDN conhecido; senão, null. */
export function safeImageUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && isAllowedImageHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
