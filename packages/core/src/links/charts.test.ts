import { describe, expect, it } from 'vitest';
import { chartKey, fetchLastfmTrackInfo, fetchPlatformLinks, fetchPlatformTracks, fetchWorldChart, findTrackMeta, isChartSourceUrl, LastfmKeyError, platformSearchUrl, rankWithMoves, SongLinkUnavailableError, type ChartEntry } from './charts.ts';
import type { FetchLike } from './preview.ts';

const KEY = 'abcdef0123456789abcdef0123456789';

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(hit[1]) };
  };
}

const lastfm = {
  tracks: {
    track: [
      { name: 'Espresso', listeners: '1200', artist: { name: 'Sabrina Carpenter' } },
      { name: 'Not Like Us', listeners: '900', artist: { name: 'Kendrick Lamar' } },
      { name: 'Espresso', listeners: '10', artist: { name: 'Sabrina Carpenter' } }, // repetida
      { name: '', artist: { name: 'Sem título' } },
    ],
  },
};
const deezer = (title: string, artist: string, id: number) => ({
  data: [
    { title: 'Outra', link: 'https://www.deezer.com/track/1', artist: { name: 'Outro' }, album: { title: 'X' } },
    {
      title,
      link: `https://www.deezer.com/track/${id}`,
      artist: { name: artist },
      album: { title: `${title} (Album)`, cover_big: 'https://e-cdns-images.dzcdn.net/images/cover/abc/500x500.jpg' },
    },
  ],
});

describe('ranking mundial (Last.fm + Deezer)', () => {
  it('monta o ranking, sem repetidas, com capa, álbum e link da Deezer da faixa certa', async () => {
    const calls: string[] = [];
    const fetch = fakeFetch(
      {
        'https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks': lastfm,
        'https://api.deezer.com/search?q=artist%3A%22Sabrina': deezer('Espresso', 'Sabrina Carpenter', 2801558052),
        'https://api.deezer.com/search?q=artist%3A%22Kendrick': { data: [] },
      },
      calls,
    );
    const chart = await fetchWorldChart(KEY, { fetch, pauseMs: 0 });
    expect(chart).toEqual([
      {
        position: 1,
        key: 'sabrina carpenter|espresso',
        title: 'Espresso',
        artist: 'Sabrina Carpenter',
        listeners: 1200,
        album: 'Espresso (Album)',
        imageUrl: 'https://e-cdns-images.dzcdn.net/images/cover/abc/500x500.jpg',
        deezerUrl: 'https://www.deezer.com/track/2801558052',
        appleUrl: null,
      },
      {
        position: 2,
        key: 'kendrick lamar|not like us',
        title: 'Not Like Us',
        artist: 'Kendrick Lamar',
        listeners: 900,
        album: null,
        imageUrl: null,
        deezerUrl: null,
        appleUrl: null,
      },
    ]);
    expect(calls[0]).toContain(`api_key=${KEY}`);
  });

  it('chave inválida (no formato ou recusada pelo Last.fm) vira LastfmKeyError', async () => {
    await expect(fetchWorldChart('x', { fetch: fakeFetch({}) })).rejects.toBeInstanceOf(LastfmKeyError);
    await expect(fetchWorldChart(`${KEY}&method=outra`, { fetch: fakeFetch({}) })).rejects.toBeInstanceOf(LastfmKeyError);
    const fetch = fakeFetch({ 'https://ws.audioscrobbler.com': { error: 10, message: 'Invalid API key' } });
    await expect(fetchWorldChart(KEY, { fetch })).rejects.toBeInstanceOf(LastfmKeyError);
  });

  it('Last.fm fora do ar: null', async () => {
    expect(await fetchWorldChart(KEY, { fetch: fakeFetch({}) })).toBeNull();
  });
});

describe('capa e links quando a Deezer não acha', () => {
  const ref = { title: 'Not Like Us', artist: 'Kendrick Lamar' };

  it('Apple Music completa capa, álbum e link', async () => {
    const fetch = fakeFetch({
      'https://api.deezer.com/search': { data: [] },
      'https://itunes.apple.com/search?term=Kendrick': {
        results: [
          { trackName: 'Outra', artistName: 'Outro' },
          {
            trackName: 'Not Like Us',
            artistName: 'Kendrick Lamar',
            collectionName: 'Not Like Us - Single',
            artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/100x100bb.jpg',
            trackViewUrl: 'https://music.apple.com/us/album/not-like-us/1744776162?i=1744776167&uo=4',
          },
        ],
      },
    });
    const meta = await findTrackMeta(ref, { fetch, lastfmKey: KEY });
    expect(meta.album).toBe('Not Like Us - Single');
    expect(meta.imageUrl).toBe('https://is1-ssl.mzstatic.com/image/thumb/Music/aa/600x600bb.jpg');
    expect(meta.appleUrl).toBe('https://music.apple.com/us/album/not-like-us/1744776162?i=1744776167');
    expect(meta.deezerUrl).toBeNull();
    expect(isChartSourceUrl(meta.appleUrl!)).toBe(true);
  });

  it('por último, a capa do álbum no Last.fm (sem a estrela cinza de "sem capa")', async () => {
    const fetch = fakeFetch({
      'https://ws.audioscrobbler.com/2.0/?method=track.getinfo': {
        track: {
          album: {
            title: 'GNX',
            image: [
              { '#text': 'https://lastfm.freetls.fastly.net/i/u/34s/abc.png', size: 'small' },
              { '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/abc.png', size: 'extralarge' },
            ],
          },
        },
      },
    });
    expect((await findTrackMeta(ref, { fetch, lastfmKey: KEY })).imageUrl).toBe('https://lastfm.freetls.fastly.net/i/u/300x300/abc.png');

    const placeholder = fakeFetch({
      'https://ws.audioscrobbler.com/2.0/?method=track.getinfo': {
        track: { album: { image: [{ '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png' }] } },
      },
    });
    expect((await findTrackMeta(ref, { fetch: placeholder, lastfmKey: KEY })).imageUrl).toBeNull();
  });

  it('Deezer pedindo para esperar: espera e tenta de novo', async () => {
    let first = true;
    const fetch: FetchLike = async (url) => {
      let body: unknown = { data: [] };
      if (url.startsWith('https://api.deezer.com/search')) {
        body = first ? { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } } : deezer('Not Like Us', 'Kendrick Lamar', 7);
        first = false;
      }
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
    };
    expect((await findTrackMeta(ref, { fetch, quotaWaitMs: 1 })).deezerUrl).toBe('https://www.deezer.com/track/7');
  });

  it('busca sem aspas quando a busca exata não acha', async () => {
    const fetch = fakeFetch({
      'https://api.deezer.com/search?q=artist': { data: [] },
      'https://api.deezer.com/search?q=Kendrick': deezer('Not Like Us', 'Kendrick Lamar', 9),
    });
    expect((await findTrackMeta(ref, { fetch, useItunes: false })).deezerUrl).toBe('https://www.deezer.com/track/9');
  });
});

describe('dados da música no Last.fm (track.getInfo)', () => {
  const ref = { artist: 'banda', title: 'parecida' };
  const info = {
    track: {
      name: 'Parecida',
      artist: { name: 'Banda' },
      album: {
        title: 'Álbum',
        image: [
          { '#text': 'https://lastfm.freetls.fastly.net/i/u/34s/a.jpg', size: 'small' },
          { '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/a.jpg', size: 'extralarge' },
        ],
      },
    },
  };

  it('traz o nome certo, o álbum e a maior capa', async () => {
    expect(await fetchLastfmTrackInfo(KEY, ref, { fetch: fakeFetch({ 'https://ws.audioscrobbler.com/2.0/': info }) })).toEqual({
      title: 'Parecida',
      artist: 'Banda',
      album: 'Álbum',
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/a.jpg',
    });
  });

  it('ignora a imagem cinza de "sem capa" e não conhecer a música é null (não erro)', async () => {
    const gray = { track: { ...info.track, album: { title: 'X', image: [{ '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png' }] } } };
    expect((await fetchLastfmTrackInfo(KEY, ref, { fetch: fakeFetch({ 'https://ws.audioscrobbler.com/2.0/': gray }) }))?.imageUrl).toBeNull();
    expect(await fetchLastfmTrackInfo(KEY, ref, { fetch: fakeFetch({ 'https://ws.audioscrobbler.com/2.0/': { error: 6, message: 'Track not found' } }) })).toBeNull();
  });

  it('chave recusada e Last.fm fora do ar viram erro (para não guardar "não achou")', async () => {
    await expect(fetchLastfmTrackInfo(KEY, ref, { fetch: fakeFetch({ 'https://ws.audioscrobbler.com/2.0/': { error: 10 } }) })).rejects.toBeInstanceOf(LastfmKeyError);
    await expect(fetchLastfmTrackInfo(KEY, ref, { fetch: fakeFetch({}) })).rejects.toThrow('lastfm_unavailable');
  });
});

describe('subiu, caiu, novo', () => {
  const e = (key: string, position: number): ChartEntry => ({
    key,
    position,
    title: key,
    artist: '',
    album: null,
    imageUrl: null,
    deezerUrl: null,
    appleUrl: null,
    listeners: null,
  });
  it('compara com o ranking anterior', () => {
    const ranked = rankWithMoves([e('a', 1), e('b', 2), e('c', 3), e('d', 4)], [e('b', 1), e('a', 2), e('c', 3)]);
    expect(ranked.map((r) => [r.key, r.move, r.previousPosition])).toEqual([
      ['a', 'up', 2],
      ['b', 'down', 1],
      ['c', 'same', 3],
      ['d', 'new', null],
    ]);
  });
  it('sem ranking anterior não marca nada', () => {
    expect(rankWithMoves([e('a', 1)], null)[0]!.move).toBeNull();
  });
  it('a chave ignora acento e caixa', () => {
    expect(chartKey('Beyoncé', 'TEXAS HOLD ’EM')).toBe(chartKey('beyonce', 'Texas Hold Em'));
  });
});

describe('links nas plataformas (song.link)', () => {
  it('só aceita links que são mesmo da plataforma', async () => {
    const fetch = fakeFetch({
      'https://api.song.link/v1-alpha.1/links?url=https%3A%2F%2Fwww.deezer.com%2Ftrack%2F2801558052': {
        linksByPlatform: {
          spotify: { url: 'https://open.spotify.com/track/2qSkIjg1o9h3YT9RAgYN75' },
          appleMusic: { url: 'https://music.apple.com/us/album/espresso/1739079974?i=1739079976' },
          youtubeMusic: { url: 'https://music.youtube.com/watch?v=eVli-tstM5E' },
          tidal: { url: 'https://evil.example.com/track/1' },
          deezer: { url: 'https://www.deezer.com/track/2801558052' },
        },
      },
    });
    const links = await fetchPlatformLinks('https://www.deezer.com/track/2801558052', { fetch, country: 'BR' });
    expect(links?.spotify).toBe('https://open.spotify.com/track/2qSkIjg1o9h3YT9RAgYN75');
    expect(links?.apple_music).toContain('music.apple.com');
    expect(links?.youtube_music).toBe('https://music.youtube.com/watch?v=eVli-tstM5E');
    expect(links?.deezer).toBe('https://www.deezer.com/track/2801558052');
    expect(links?.tidal).toBeUndefined();
  });

  it('traz a capa de cada plataforma (só de CDNs conhecidos)', async () => {
    const fetch = fakeFetch({
      'https://api.song.link/': {
        linksByPlatform: {
          spotify: { url: 'https://open.spotify.com/track/2qSkIjg1o9h3YT9RAgYN75', entityUniqueId: 'SPOTIFY_SONG::1' },
          amazonMusic: { url: 'https://music.amazon.com/albums/B0D1?trackAsin=B0D2', entityUniqueId: 'AMAZON_SONG::2' },
          tidal: { url: 'https://tidal.com/browse/track/123', entityUniqueId: 'TIDAL_SONG::3' },
        },
        entitiesByUniqueId: {
          'SPOTIFY_SONG::1': { thumbnailUrl: 'https://i.scdn.co/image/ab67' },
          'AMAZON_SONG::2': { thumbnailUrl: 'https://m.media-amazon.com/images/I/capa.jpg' },
          'TIDAL_SONG::3': { thumbnailUrl: 'https://evil.example.com/capa.jpg' },
        },
      },
    });
    const r = await fetchPlatformTracks('https://www.deezer.com/track/2801558052', { fetch });
    expect(r?.images).toEqual({ spotify: 'https://i.scdn.co/image/ab67', amazon_music: 'https://m.media-amazon.com/images/I/capa.jpg' });
    expect(r?.links.tidal).toBe('https://tidal.com/browse/track/123');
  });

  it('limite de pedidos não vira "não achou"', async () => {
    const limited: FetchLike = async () => ({ ok: false, status: 429, headers: { get: () => null }, text: async () => '' });
    await expect(fetchPlatformTracks('https://www.deezer.com/track/2801558052', { fetch: limited })).rejects.toBeInstanceOf(SongLinkUnavailableError);
    expect(await fetchPlatformLinks('https://www.deezer.com/track/2801558052', { fetch: limited })).toBeNull();
    // Música que o song.link não conhece: null (não é erro).
    expect(await fetchPlatformTracks('https://www.deezer.com/track/2801558052', { fetch: fakeFetch({}) })).toBeNull();
  });

  it('aceita o link da Apple Music como origem', async () => {
    const calls: string[] = [];
    await fetchPlatformLinks('https://music.apple.com/us/album/not-like-us/1744776162?i=1744776167', { fetch: fakeFetch({}, calls) });
    expect(calls[0]).toContain('api.song.link');
  });

  it('não consulta com link que não é de faixa da Deezer', async () => {
    const calls: string[] = [];
    expect(await fetchPlatformLinks('https://evil.example.com/x', { fetch: fakeFetch({}, calls) })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('busca na plataforma quando não há o link exato', () => {
    expect(platformSearchUrl('spotify', 'Not Like Us', 'Kendrick Lamar')).toBe('https://open.spotify.com/search/Not%20Like%20Us%20Kendrick%20Lamar');
    expect(platformSearchUrl('youtube_music', 'A&B', 'C')).toBe('https://music.youtube.com/search?q=A%26B%20C');
  });
});
