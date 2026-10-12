import { describe, expect, it } from 'vitest';
import { chartKey, LastfmKeyError } from './charts.ts';
import { deezerAlbumGenres, DEEZER_GENRES, deezerTrackById, findDeezerTrack, fitsGenre, lastfmTags, mixCandidates, previewExpiresAt, previewUsable, recommend, type Candidate } from './discover.ts';
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
    const tags = calls.map((u) => decodeURIComponent(/tag=([^&]+)/.exec(u)![1]!));
    // Primeiro a tag certa; com pouca coisa nela, as reservas do funk brasileiro. Nunca o "funk" americano.
    expect(tags[0]).toBe('funk carioca');
    expect(tags.every((t) => ['funk carioca', 'baile funk', 'funk brasileiro'].includes(t))).toBe(true);
  });

  it('com sugestões suficientes, não completa com as mais tocadas do mundo (pop)', async () => {
    const many = { tracks: { track: Array.from({ length: 30 }, (_, i) => ({ name: `Funk ${i}`, artist: { name: `MC ${i}` } })) } };
    const out = await recommend(KEY, { genres: ['funk_br'], liked: [], seenKeys: [] }, {
      fetch: fakeFetch({ ...lastfm, 'https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks': many }),
      size: 10,
      random: () => 0,
    });
    expect(out).toHaveLength(10);
    expect(out.every((x) => x.reason.kind === 'genre')).toBe(true);
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
    album: { id: 302127, title: 'Discovery', cover_big: 'https://e-cdns-images.dzcdn.net/images/cover/y/500x500.jpg' },
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
      albumId: '302127',
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

describe('validade da prévia da Deezer', () => {
  const at = (s: number) => `https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/abc.mp3?hdnea=exp=${s}~acl=/api/1/1/a/b/c/0/abc.mp3*~data=user_id=0,application_id=42~hmac=ff`;
  it('lê o exp do hdnea/hdnts', () => {
    expect(previewExpiresAt(at(1760000000))).toBe(1760000000_000);
    expect(previewExpiresAt('https://cdnt-preview.dzcdn.net/x.mp3?hdnts=exp=1760000000~hmac=1')).toBe(1760000000_000);
    expect(previewExpiresAt('https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a')).toBeNull();
    expect(previewExpiresAt(null)).toBeNull();
  });
  it('vencida (ou quase) não serve; sem validade serve; sem link não', () => {
    const now = 1760000000_000;
    expect(previewUsable(at(1760000000 + 3600), now)).toBe(true);
    expect(previewUsable(at(1760000000 + 30), now)).toBe(false); // vence em 30 s (margem de 1 min)
    expect(previewUsable(at(1760000000 - 10), now)).toBe(false);
    expect(previewUsable('https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a', now)).toBe(true);
    expect(previewUsable(null, now)).toBe(false);
  });
});

describe('gêneros certos', () => {
  it('tags do Last.fm: funk brasileiro e subgêneros caem em funk carioca; o americano é outro', () => {
    expect(lastfmTags('funk_br')[0]).toBe('funk carioca');
    expect(lastfmTags('funk_paulista')).toEqual(['funk paulista', 'funk ostentacao', 'funk carioca']);
    expect(lastfmTags('brega_funk').at(-1)).toBe('funk carioca');
    expect(lastfmTags('funk')).not.toContain('funk carioca');
    // Gênero do catálogo sem tabela: o próprio nome e, de reserva, o gênero de destaque do nome.
    expect(lastfmTags('sertanejo_universitario')).toEqual(['sertanejo universitario', 'sertanejo']);
    expect(lastfmTags('rock')).toEqual(['rock']);
  });

  it('conferência na Deezer: descarta só o que claramente é de outro gênero', () => {
    const D = DEEZER_GENRES;
    expect(fitsGenre('funk_br', [D.soulFunk])).toBe(false); // funk americano no lugar do brasileiro
    expect(fitsGenre('funk_paulista', [D.soulFunk, D.rnb])).toBe(true); // um dos gêneros serve
    expect(fitsGenre('funk_br', [D.brazilian])).toBe(true);
    expect(fitsGenre('funk', [D.brazilian])).toBe(false);
    expect(fitsGenre('funk_br', null)).toBe(true); // sem informação: aceita
    expect(fitsGenre('shoegaze', [D.metal])).toBe(true); // gênero sem conferência
  });

  it('gêneros do álbum na Deezer', async () => {
    const fetch = fakeFetch({ 'https://api.deezer.com/album/302127': { genres: { data: [{ id: 113, name: 'Dance' }, { id: 106, name: 'Electro' }] } } });
    expect(await deezerAlbumGenres('302127', { fetch })).toEqual([113, 106]);
    expect(await deezerAlbumGenres('../x', { fetch })).toBeNull();
    expect(await deezerAlbumGenres('1', { fetch: fakeFetch({}) })).toBeNull();
  });
});
