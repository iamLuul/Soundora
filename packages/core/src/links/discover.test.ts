import { describe, expect, it } from 'vitest';
import { chartKey, LastfmKeyError } from './charts.ts';
import { deezerTrackById, findDeezerTrack, mixCandidates, recommend, type Candidate } from './discover.ts';
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

const c = (artist: string, title: string, kind: 'similar' | 'genre' | 'popular'): Candidate => ({
  artist,
  title,
  key: chartKey(artist, title),
  reason: kind === 'similar' ? { kind, because: { artist: 'X', title: 'Y' } } : kind === 'genre' ? { kind, genre: 'rock' } : { kind },
});

describe('mistura das sugestões', () => {
  it('alterna 2 parecidas para 1 de gênero, sem repetir e sem o que já foi visto', () => {
    const out = mixCandidates(
      {
        similar: [c('A', '1', 'similar'), c('A', '2', 'similar'), c('A', '3', 'similar'), c('B', 'dup', 'similar')],
        genre: [c('G', '1', 'genre'), c('B', 'dup', 'genre'), c('G', 'visto', 'genre')],
        popular: [c('P', '1', 'popular')],
      },
      new Set([chartKey('G', 'visto')]),
      10,
    );
    expect(out.map((x) => `${x.artist}${x.title}`)).toEqual(['A1', 'A2', 'G1', 'A3', 'Bdup', 'P1']);
  });
});

describe('recomendações', () => {
  const lastfm = {
    'https://ws.audioscrobbler.com/2.0/?method=track.getsimilar': {
      similartracks: { track: [{ name: 'Parecida', artist: { name: 'Banda' } }, { name: 'Vista', artist: { name: 'Banda' } }] },
    },
    'https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks': { tracks: { track: [{ name: 'Do Gênero', artist: { name: 'Outra' } }] } },
    'https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks': { tracks: { track: [{ name: 'Hit', artist: { name: 'Pop Star' } }] } },
  };

  it('parecidas com as curtidas + dos gêneros, sem o que a pessoa já viu; completa com as mais tocadas', async () => {
    const calls: string[] = [];
    const out = await recommend(
      KEY,
      { genres: ['rock'], liked: [{ title: 'Curtida', artist: 'Banda' }], seenKeys: [chartKey('Banda', 'Vista')] },
      { fetch: fakeFetch(lastfm, calls), size: 10, random: () => 0 },
    );
    expect(out.map((x) => [x.title, x.reason.kind])).toEqual([
      ['Parecida', 'similar'],
      ['Do Gênero', 'genre'],
      ['Hit', 'popular'],
    ]);
    expect(out[0]!.reason).toEqual({ kind: 'similar', because: { title: 'Curtida', artist: 'Banda' } });
    expect(calls.some((u) => u.includes('tag=rock'))).toBe(true);
  });

  it('só um gênero (busca de gênero na tela)', async () => {
    const calls: string[] = [];
    const out = await recommend(KEY, { genres: ['rock'], liked: [], seenKeys: [] }, { fetch: fakeFetch(lastfm, calls), size: 10, onlyGenre: 'funk_br', random: () => 0 });
    expect(out.map((x) => x.reason)).toEqual([{ kind: 'genre', genre: 'funk_br' }]);
    expect(calls.every((u) => u.includes('tag=funk%20carioca'))).toBe(true);
  });

  it('chave inválida avisa; Last.fm fora do ar só deixa a lista vazia', async () => {
    await expect(recommend('x', { genres: ['rock'], liked: [], seenKeys: [] }, { fetch: fakeFetch({}), size: 5 })).rejects.toBeInstanceOf(LastfmKeyError);
    expect(await recommend(KEY, { genres: ['rock'], liked: [], seenKeys: [] }, { fetch: fakeFetch({}), size: 5 })).toEqual([]);
  });
});

describe('Deezer', () => {
  const hit = {
    id: 3135556,
    title: 'Harder, Better, Faster, Stronger',
    link: 'https://www.deezer.com/track/3135556',
    preview: 'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnts=exp=1',
    artist: { name: 'Daft Punk', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist/x/250x250.jpg' },
    album: { title: 'Discovery', cover_big: 'https://e-cdns-images.dzcdn.net/images/cover/y/500x500.jpg' },
  };

  it('acha a faixa certa com capa, álbum, foto do artista e prévia', async () => {
    const fetch = fakeFetch({ 'https://api.deezer.com/search': { data: [{ ...hit, title: 'Outra', artist: { name: 'Outro' } }, hit] } });
    expect(await findDeezerTrack({ title: 'Harder Better Faster Stronger', artist: 'Daft Punk' }, { fetch })).toEqual({
      id: '3135556',
      url: 'https://www.deezer.com/track/3135556',
      title: 'Harder, Better, Faster, Stronger',
      artist: 'Daft Punk',
      album: 'Discovery',
      imageUrl: 'https://e-cdns-images.dzcdn.net/images/cover/y/500x500.jpg',
      artistImageUrl: 'https://e-cdns-images.dzcdn.net/images/artist/x/250x250.jpg',
      previewUrl: hit.preview,
    });
  });

  it('prévia de fora da Deezer/Apple é ignorada; limite da Deezer vira "quota"', async () => {
    const evil = fakeFetch({ 'https://api.deezer.com/search': { data: [{ ...hit, preview: 'https://evil.example.com/x.mp3' }] } });
    expect((await findDeezerTrack({ title: 'Harder, Better, Faster, Stronger', artist: 'Daft Punk' }, { fetch: evil }))).toMatchObject({ previewUrl: null });
    const quota = fakeFetch({ 'https://api.deezer.com/search': { error: { code: 4 } } });
    expect(await findDeezerTrack({ title: 'x', artist: 'y' }, { fetch: quota })).toBe('quota');
  });

  it('busca pelo id para renovar a prévia (e recusa id estranho)', async () => {
    const calls: string[] = [];
    const fetch = fakeFetch({ 'https://api.deezer.com/track/3135556': hit }, calls);
    expect((await deezerTrackById('3135556', { fetch }))?.previewUrl).toBe(hit.preview);
    expect(await deezerTrackById('../x', { fetch })).toBeNull();
    expect(calls).toEqual(['https://api.deezer.com/track/3135556']);
  });
});
