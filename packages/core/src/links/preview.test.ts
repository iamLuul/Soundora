import { describe, expect, it } from 'vitest';
import { buildLinkPreview, LinkPreviewError, parseOpenGraph, spotifyArtistFromDescription, type FetchLike } from './preview.ts';

type Route = { status?: number; body?: unknown; location?: string };

/** fetch falso: responde por URL exata e registra as chamadas. */
function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => (n.toLowerCase() === 'location' ? (r.location ?? null) : null) },
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})),
    };
  };
  return { fetch, calls };
}

const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

describe('buildLinkPreview', () => {
  it('Spotify: oEmbed para título e capa, Open Graph para o artista', async () => {
    const { fetch } = fakeFetch({
      [`https://open.spotify.com/oembed?url=${encodeURIComponent(SPOTIFY)}`]: {
        body: { title: 'Bohemian Rhapsody', thumbnail_url: 'https://i.scdn.co/image/abc' },
      },
      [SPOTIFY]: { body: '<meta property="og:description" content="Listen to Bohemian Rhapsody on Spotify. Song · Queen · 1975">' },
    });
    const p = await buildLinkPreview(`${SPOTIFY}?si=x`, { fetch });
    expect(p).toEqual({
      platform: 'spotify',
      kind: 'track',
      url: SPOTIFY,
      providerId: '4uLU6hMCjMI75M1A2tKUQC',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      imageUrl: 'https://i.scdn.co/image/abc',
    });
  });

  it('Spotify: segue sem artista se a página falhar', async () => {
    const { fetch } = fakeFetch({
      [`https://open.spotify.com/oembed?url=${encodeURIComponent(SPOTIFY)}`]: { body: { title: 'Faixa' } },
    });
    const p = await buildLinkPreview(SPOTIFY, { fetch });
    expect(p.artist).toBeNull();
    expect(p.title).toBe('Faixa');
  });

  it('Deezer: usa a API pública', async () => {
    const { fetch } = fakeFetch({
      'https://api.deezer.com/track/3135556': {
        body: { title: 'Harder, Better, Faster, Stronger', artist: { name: 'Daft Punk' }, album: { cover_xl: 'https://cdn/cover.jpg' } },
      },
    });
    const p = await buildLinkPreview('https://www.deezer.com/br/track/3135556', { fetch });
    expect(p).toMatchObject({ title: 'Harder, Better, Faster, Stronger', artist: 'Daft Punk', imageUrl: 'https://cdn/cover.jpg' });
  });

  it('Deezer: erro da API vira not_found', async () => {
    const { fetch } = fakeFetch({ 'https://api.deezer.com/track/1': { body: { error: { code: 800 } } } });
    await expect(buildLinkPreview('https://www.deezer.com/track/1', { fetch })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('Apple Music: iTunes Lookup com capa em alta resolução', async () => {
    const { fetch } = fakeFetch({
      'https://itunes.apple.com/lookup?id=1440650711': {
        body: { resultCount: 1, results: [{ trackName: 'Bohemian Rhapsody', artistName: 'Queen', artworkUrl100: 'https://a/100x100bb.jpg' }] },
      },
    });
    const p = await buildLinkPreview('https://music.apple.com/br/album/x/1440650428?i=1440650711', { fetch });
    expect(p).toMatchObject({ title: 'Bohemian Rhapsody', artist: 'Queen', imageUrl: 'https://a/600x600bb.jpg' });
  });

  it('YouTube Music: oEmbed do YouTube e limpa " - Topic"', async () => {
    const target = encodeURIComponent('https://www.youtube.com/watch?v=fJ9rUzIMcZQ');
    const { fetch } = fakeFetch({
      [`https://www.youtube.com/oembed?format=json&url=${target}`]: {
        body: { title: 'Bohemian Rhapsody', author_name: 'Queen - Topic', thumbnail_url: 'https://i.ytimg.com/x.jpg' },
      },
    });
    const p = await buildLinkPreview('https://music.youtube.com/watch?v=fJ9rUzIMcZQ', { fetch });
    expect(p).toMatchObject({ platform: 'youtube_music', artist: 'Queen', url: 'https://music.youtube.com/watch?v=fJ9rUzIMcZQ' });
  });

  it('SoundCloud: separa "Faixa by Artista"', async () => {
    const url = 'https://soundcloud.com/artista/faixa';
    const { fetch } = fakeFetch({
      [`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`]: { body: { title: 'Faixa by Artista', author_name: 'Artista' } },
    });
    const p = await buildLinkPreview(url, { fetch });
    expect(p).toMatchObject({ title: 'Faixa', artist: 'Artista' });
  });

  it('Bandcamp: Open Graph "Faixa, by Artista"', async () => {
    const url = 'https://artista.bandcamp.com/track/faixa';
    const { fetch } = fakeFetch({
      [url]: { body: `<meta property="og:title" content="Faixa &amp; Cia, by Artista"><meta property="og:image" content="https://f4.bcbits.com/a.jpg">` },
    });
    const p = await buildLinkPreview(url, { fetch });
    expect(p).toMatchObject({ title: 'Faixa & Cia', artist: 'Artista', imageUrl: 'https://f4.bcbits.com/a.jpg' });
  });

  it('segue link curto até a página da plataforma', async () => {
    const { fetch, calls } = fakeFetch({
      'https://spotify.link/AbCd': { status: 307, location: `${SPOTIFY}?si=1` },
      [`https://open.spotify.com/oembed?url=${encodeURIComponent(SPOTIFY)}`]: { body: { title: 'Faixa' } },
    });
    const p = await buildLinkPreview('https://spotify.link/AbCd', { fetch });
    expect(p.url).toBe(SPOTIFY);
    expect(calls[0]).toBe('https://spotify.link/AbCd');
  });

  it('não segue redirecionamento para host fora da lista (SSRF)', async () => {
    const { fetch, calls } = fakeFetch({
      'https://spotify.link/evil': { status: 302, location: 'http://169.254.169.254/latest/meta-data' },
    });
    await expect(buildLinkPreview('https://spotify.link/evil', { fetch })).rejects.toBeInstanceOf(LinkPreviewError);
    expect(calls).not.toContain('http://169.254.169.254/latest/meta-data');
  });

  it('recusa link de plataforma não suportada', async () => {
    const { fetch, calls } = fakeFetch({});
    await expect(buildLinkPreview('https://example.com/musica', { fetch })).rejects.toMatchObject({ code: 'unsupported' });
    expect(calls).toHaveLength(0);
  });

  it('erro de rede vira fetch_failed', async () => {
    const fetch: FetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    await expect(buildLinkPreview('https://www.deezer.com/track/1', { fetch })).rejects.toMatchObject({ code: 'fetch_failed' });
  });
});

describe('parseOpenGraph', () => {
  it('lê atributos em qualquer ordem e decodifica entidades', () => {
    const og = parseOpenGraph(`<meta content='Ol&aacute; &#8212; mundo' property='og:title'><meta property="og:image" content="https://x/y.png">`);
    expect(og['og:title']).toBe('Ol&aacute; — mundo');
    expect(og['og:image']).toBe('https://x/y.png');
  });
});

describe('spotifyArtistFromDescription', () => {
  it('faixa', () => expect(spotifyArtistFromDescription('Listen to X on Spotify. Song · Queen · 1975')).toBe('Queen'));
  it('álbum', () => expect(spotifyArtistFromDescription('Listen to X on Spotify. Queen · Album · 1975 · 12 songs.')).toBe('Queen'));
  it('playlist não tem artista', () => expect(spotifyArtistFromDescription('Playlist · Spotify · 50 items')).toBeNull());
});
