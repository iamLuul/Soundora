import { describe, expect, it } from 'vitest';
import { detectGenres, GENRE_SLUGS, mapStoreGenre, mapStoreGenres } from './genres.ts';
import type { FetchLike } from './preview.ts';

describe('mapStoreGenre', () => {
  it.each([
    ['Hip-Hop/Rap', 'hip_hop'],
    ['Rap/Hip Hop', 'hip_hop'],
    ['Trap', 'trap'],
    ['Alternative', 'alternative'],
    ['Indie Rock', 'indie'],
    ['Rock', 'rock'],
    ['Pop', 'pop'],
    ['K-Pop', 'k_pop'],
    ['MPB', 'mpb'],
    ['Música Brasileira', 'mpb'],
    ['Sertanejo', 'sertanejo'],
    ['Samba', 'samba'],
    ['Pagode', 'pagode'],
    ['Funk Carioca', 'funk_br'],
    ['R&B/Soul', 'r_and_b'],
    ['Soul', 'soul'],
    ['Electronic', 'electronic'],
    ['Dance', 'dance'],
    ['Música Eletrônica', 'electronic'],
    ['Reggaeton y Hip-Hop', 'hip_hop'],
    ['Latino', 'latin'],
    ['Singer/Songwriter', 'folk'],
    ['Heavy Metal', 'metal'],
    ['Jazz', 'jazz'],
    ['Clássica', 'classical'],
    ['Christian & Gospel', 'gospel'],
  ])('%s → %s', (name, slug) => {
    expect(mapStoreGenre(name)).toBe(slug);
  });

  it('desconhecido ou vazio → null', () => {
    expect(mapStoreGenre('Comedy')).toBeNull();
    expect(mapStoreGenre('   ')).toBeNull();
  });

  it('só devolve gêneros que existem no Soundora, sem repetir, até 3', () => {
    expect(mapStoreGenres(['Pop', 'Pop', 'Dance', 'Rock', 'Jazz'])).toEqual(['pop', 'dance', 'rock']);
    expect(mapStoreGenres(['Pop', 'Comedy']).every((g) => (GENRE_SLUGS as readonly string[]).includes(g))).toBe(true);
  });
});

function fakeFetch(routes: Record<string, unknown>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const body = key ? routes[key] : undefined;
    return { ok: !!key, status: key ? 200 : 404, headers: { get: () => null }, text: async () => JSON.stringify(body ?? {}) };
  };
  return { fetch, calls };
}

describe('detectGenres', () => {
  it('junta Apple (faixa) e Deezer (álbum)', async () => {
    const { fetch, calls } = fakeFetch({
      'https://itunes.apple.com/search': { results: [{ primaryGenreName: 'Alternative' }] },
      'https://api.deezer.com/search': { data: [{ album: { id: 302127 } }] },
      'https://api.deezer.com/album/302127': { genres: { data: [{ name: 'Electro' }, { name: 'Alternative' }] } },
    });
    expect(await detectGenres('Midnight City', 'M83', { fetch })).toEqual(['alternative', 'electronic']);
    expect(calls.every((u) => u.startsWith('https://itunes.apple.com/') || u.startsWith('https://api.deezer.com/'))).toBe(true);
    expect(calls[0]).toContain('M83%20Midnight%20City');
  });

  it('lojas fora do ar ou respostas estranhas: lista vazia, sem erro', async () => {
    const { fetch } = fakeFetch({ 'https://api.deezer.com/search': { data: [{ album: { id: 'x; DROP' } }] } });
    expect(await detectGenres('Faixa', null, { fetch })).toEqual([]);
    const failing: FetchLike = async () => {
      throw new Error('offline');
    };
    expect(await detectGenres('Faixa', 'Artista', { fetch: failing })).toEqual([]);
  });
});
