import { describe, expect, it } from 'vitest';
import { detectGenres, detectStoreInfo, GENRE_SLUGS, isAllowedAudioUrl, mapStoreGenre, mapStoreGenres } from './genres.ts';
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

  it('só devolve gêneros que existem no Soundhora, sem repetir, até 3', () => {
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

describe('prévia de 30 s', () => {
  it('pega a da Apple quando a faixa é a mesma (ignora versão e acento)', async () => {
    const { fetch } = fakeFetch({
      'https://itunes.apple.com/search': {
        results: [
          { trackName: 'Outra Música', artistName: 'Outro', previewUrl: 'https://audio-ssl.itunes.apple.com/x/errada.m4a' },
          { trackName: 'Midnight City (Remastered)', artistName: 'M83', primaryGenreName: 'Electronic', previewUrl: 'https://audio-ssl.itunes.apple.com/x/certa.m4a' },
        ],
      },
    });
    const info = await detectStoreInfo({ title: 'Midnight City', artist: 'M83' }, { fetch });
    expect(info.audioUrl).toBe('https://audio-ssl.itunes.apple.com/x/certa.m4a');
  });

  it('link do Apple Music: busca a faixa exata pelo id', async () => {
    const { fetch, calls } = fakeFetch({
      'https://itunes.apple.com/lookup': { results: [{ trackName: 'Qualquer', primaryGenreName: 'Pop', previewUrl: 'https://audio-ssl.itunes.apple.com/p.m4a' }] },
    });
    const info = await detectStoreInfo({ title: 'Faixa', artist: 'X', platform: 'apple_music', kind: 'track', providerId: '1440818839' }, { fetch });
    expect(calls[0]).toBe('https://itunes.apple.com/lookup?entity=song&id=1440818839');
    expect(info).toEqual({ genres: ['pop'], audioUrl: 'https://audio-ssl.itunes.apple.com/p.m4a' });
  });

  it('sem a Apple, usa a da Deezer; endereço de fora das lojas é recusado', async () => {
    const { fetch } = fakeFetch({
      'https://api.deezer.com/track/3135556': { title: 'Harder', artist: { name: 'Daft Punk' }, preview: 'https://cdnt-preview.dzcdn.net/api/1/1/a.mp3?hdnea=exp=1' },
    });
    expect((await detectStoreInfo({ title: 'Harder', artist: 'Daft Punk', platform: 'deezer', kind: 'track', providerId: '3135556' }, { fetch })).audioUrl).toBe(
      'https://cdnt-preview.dzcdn.net/api/1/1/a.mp3?hdnea=exp=1',
    );
    const evil = fakeFetch({ 'https://itunes.apple.com/search': { results: [{ trackName: 'Faixa', artistName: 'Artista', previewUrl: 'https://evil.example/a.mp3' }] } });
    expect((await detectStoreInfo({ title: 'Faixa', artist: 'Artista' }, { fetch: evil.fetch })).audioUrl).toBeNull();
    expect(isAllowedAudioUrl('http://audio-ssl.itunes.apple.com/a.m4a')).toBe(false);
  });

  it('faixa diferente não toca a prévia errada', async () => {
    const { fetch } = fakeFetch({
      'https://itunes.apple.com/search': { results: [{ trackName: 'Cover de Midnight', artistName: 'Banda X', previewUrl: 'https://audio-ssl.itunes.apple.com/cover.m4a' }] },
    });
    expect((await detectStoreInfo({ title: 'Midnight City', artist: 'M83' }, { fetch })).audioUrl).toBeNull();
  });
});
