import { describe, expect, it } from 'vitest';
import { chartKey, fetchPlatformLinks, fetchWorldChart, LastfmKeyError, platformSearchUrl, rankWithMoves, type ChartEntry } from './charts.ts';
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
    const chart = await fetchWorldChart(KEY, { fetch });
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

describe('subiu, caiu, novo', () => {
  const e = (key: string, position: number): ChartEntry => ({
    key,
    position,
    title: key,
    artist: '',
    album: null,
    imageUrl: null,
    deezerUrl: null,
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
