// Testes da Edge Function discover no Deno, com Supabase e APIs simulados.
// npm run test:functions
import { chartKey, LastfmKeyError } from '../_shared/links/charts.ts';
import type { Candidate, DeezerAlbum, DeezerTrack } from '../_shared/links/discover.ts';
import { createHandler, type Deps, type LastfmMeta, type TrackRow } from './handler.ts';
import type { StreamingChoice } from '../_shared/links/charts.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const NOW = new Date('2026-10-11T12:00:00Z');
const LASTFM_COVER = 'https://lastfm.freetls.fastly.net/i/u/300x300/capa.jpg';
const DEEZER_COVER = 'https://e-cdns-images.dzcdn.net/images/cover/x/500x500.jpg';
const cand = (artist: string, title: string, reason: Candidate['reason']): Candidate => ({ artist, title, key: chartKey(artist, title), reason });
const deezer = (id: number, artist: string, title: string): DeezerTrack => ({
  id: String(id),
  url: `https://www.deezer.com/track/${id}`,
  title,
  artist,
  album: `${title} (álbum)`,
  imageUrl: 'https://e-cdns-images.dzcdn.net/images/cover/x/500x500.jpg',
  artistImageUrl: null,
  previewUrl: `https://cdnt-preview.dzcdn.net/${id}.mp3`,
  albumId: String(id * 10),
});

function setup(overrides: Partial<Deps> = {}) {
  const rows = new Map<string, TrackRow>();
  const lookups = new Map<string, string | null>();
  const lastfm = new Map<string, LastfmMeta>();
  const calls = { find: 0, byId: 0, fetchLinks: 0, albums: 0, lastfm: 0, recommend: [] as (string | null)[] };
  let n = 0;
  const deps: Deps = {
    debug: true,
    log: () => {},
    now: () => NOW,
    pauseMs: 0,
    getUserId: async (h) => (h === 'Bearer ok' ? 'user-1' : null),
    rateLimit: async () => true,
    seeds: async () => ({ genres: ['rock'], liked: [{ artist: 'Banda', title: 'Curtida' }], seenKeys: [], seenPreviewIds: [] }),
    recommend: async (_s, _size, genre) => {
      calls.recommend.push(genre);
      return [
        cand('Banda', 'Parecida', { kind: 'similar', because: { artist: 'Banda', title: 'Curtida' } }),
        cand('Ninguém', 'Inexistente', { kind: 'genre', genre: 'rock' }),
        cand('Outra', 'Do Gênero', { kind: 'genre', genre: 'rock' }),
      ];
    },
    lookup: async (keys) => new Map(keys.filter((k) => lookups.has(k)).map((k) => [k, lookups.get(k) ? rows.get(lookups.get(k)!)! : null])),
    findTrack: async (ref) => {
      calls.find++;
      return ref.artist === 'Ninguém' ? null : deezer(100 + calls.find, ref.artist, ref.title);
    },
    trackById: async (id) => {
      calls.byId++;
      return { ...deezer(Number(id), 'x', 'y'), previewUrl: `https://cdnt-preview.dzcdn.net/${id}-novo.mp3` };
    },
    saveTrack: async (key, track, genre) => {
      if (!track) {
        lookups.set(key, null);
        return null;
      }
      const row: TrackRow = {
        id: `00000000-0000-4000-8000-00000000000${++n}`,
        url: track.url,
        platform: 'deezer',
        provider_id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        image_url: track.imageUrl,
        artist_image_url: track.artistImageUrl,
        audio_url: track.previewUrl,
        genres: genre ? [genre] : null,
        store_checked_at: NOW.toISOString(),
      };
      rows.set(row.id, row);
      lookups.set(key, row.id);
      return row;
    },
    saveAudio: async (id, url) => void (rows.get(id)!.audio_url = url),
    albumGenres: async () => {
      calls.albums++;
      return [75];
    },
    saveGenreIds: async (id, ids) => void (rows.get(id)!.store_genre_ids = ids),
    getTrack: async (id) => rows.get(id) ?? null,
    // Last.fm: só "Parecida" tem álbum e capa por lá; as outras ficam com o que a Deezer achou.
    lastfmInfo: async (ref) => {
      calls.lastfm++;
      return ref.title === 'Parecida' ? { title: 'Parecida', artist: 'Banda', album: 'Álbum do Last.fm', imageUrl: LASTFM_COVER } : null;
    },
    findLastfm: async (ids) => new Map(ids.filter((id) => lastfm.has(id)).map((id) => [id, lastfm.get(id)!])),
    saveLastfm: async (id, m) => void lastfm.set(id, { ...m, checked_at: NOW.toISOString() }),
    findLinks: async () => null,
    saveLinks: async () => {},
    fetchLinks: async () => {
      calls.fetchLinks++;
      return { links: { spotify: 'https://open.spotify.com/track/abc' }, images: {} };
    },
    searchAlbums: async (q) =>
      q === 'cota'
        ? 'quota'
        : [{ id: '302127', url: 'https://www.deezer.com/album/302127', title: 'Discovery', artist: 'Daft Punk', imageUrl: null, recordType: 'album', year: null, releaseDate: null }],
    albumById: async (id): Promise<DeezerAlbum | null> =>
      id === '302127' ? { id, url: `https://www.deezer.com/album/${id}`, title: 'Discovery', artist: 'Daft Punk', imageUrl: null, recordType: 'album', year: 2001, releaseDate: '2001-03-07' } : null,
    searchTracks: async (q) => (q === 'cota' ? 'quota' : [deezer(3135556, 'Daft Punk', 'Harder, Better, Faster, Stronger')]),
    saveSong: async (t) => ({ id: 'song-1', url: t.url, platform: 'deezer', title: t.title, artist: t.artist, image_url: t.imageUrl }),
    saveAlbum: async (a) => ({ id: 'alb-1', url: a.url, platform: 'deezer', kind: 'album', title: a.title, artist: a.artist, image_url: a.imageUrl, release_year: a.year }),
    ...overrides,
  };
  return { handler: createHandler(deps), rows, lookups, calls, lastfm };
}

const post = (body: unknown, auth = 'Bearer ok') =>
  new Request('http://x/discover', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

Deno.test('sem login: 401; ação ou gênero inválido: 400', async () => {
  const { handler } = setup();
  assertEquals((await handler(post({ action: 'deck' }, ''))).status, 401);
  assertEquals((await handler(post({ action: 'outra' }))).status, 400);
  assertEquals((await handler(post({ action: 'deck', genre: 'Não Vale!' }))).status, 400);
});

Deno.test('pilha: sugestões achadas na Deezer, com o motivo; a que não existe fica de fora e é lembrada', async () => {
  const { handler, calls, lookups } = setup();
  const body = await (await handler(post({ action: 'deck' }))).json();
  assertEquals(
    body.cards.map((c: { title: string; reason: string; because: string | null; genre: string | null; audio_url: string }) => [c.title, c.reason, c.because, c.genre]),
    [
      ['Parecida', 'similar', 'Banda – Curtida', null],
      ['Do Gênero', 'genre', null, 'rock'],
    ],
  );
  assertEquals(lookups.get(chartKey('Ninguém', 'Inexistente')), null);
  assertEquals(calls.find, 3);
  // Segunda vez: tudo do cache, nenhuma busca nova.
  await handler(post({ action: 'deck' }));
  assertEquals(calls.find, 3);
});

Deno.test('o que a pessoa já viu não volta; gênero escolhido vai para o algoritmo', async () => {
  const first = setup();
  const cards = (await (await first.handler(post({ action: 'deck', genre: 'funk_br' }))).json()).cards;
  assertEquals(first.calls.recommend, ['funk_br']);
  const seen = setup({ seeds: async () => ({ genres: [], liked: [], seenKeys: [], seenPreviewIds: [cards[0].link_preview_id] }) });
  // Mesmos ids gerados na mesma ordem: a primeira já foi vista.
  const again = (await (await seen.handler(post({ action: 'deck' }))).json()).cards;
  assertEquals(again.map((c: { title: string }) => c.title), ['Do Gênero']);
});

Deno.test('prévia vencida da Deezer é renovada', async () => {
  const s = setup();
  await s.handler(post({ action: 'deck' }));
  for (const r of s.rows.values()) r.store_checked_at = '2026-10-10T00:00:00Z';
  const body = await (await s.handler(post({ action: 'deck' }))).json();
  assertEquals(s.calls.byId, 2);
  assertEquals(body.cards[0].audio_url.endsWith('-novo.mp3'), true);
});

Deno.test('Deezer pedindo para esperar: para de buscar nesta pilha', async () => {
  const { handler, calls } = setup({ findTrack: async () => 'quota' });
  const body = await (await handler(post({ action: 'deck' }))).json();
  assertEquals([body.cards.length, calls.find], [0, 0]);
});

Deno.test('sem chave do Last.fm: 503', async () => {
  const { handler } = setup({ recommend: () => Promise.reject(new LastfmKeyError()) });
  const res = await handler(post({ action: 'deck' }));
  assertEquals([res.status, (await res.json()).error], [503, 'discover_unavailable']);
});

Deno.test('link: mesma plataforma direto; outra pelo song.link; sem achar, a busca', async () => {
  const s = setup();
  const cards = (await (await s.handler(post({ action: 'deck' }))).json()).cards;
  const id = cards[0].link_preview_id;
  assertEquals(await (await s.handler(post({ action: 'link', previewId: id, platform: 'deezer' }))).json(), { url: cards[0].url, exact: true });
  assertEquals(await (await s.handler(post({ action: 'link', previewId: id, platform: 'spotify' }))).json(), { url: 'https://open.spotify.com/track/abc', exact: true });
  assertEquals((await (await s.handler(post({ action: 'link', previewId: id, platform: 'tidal' }))).json()).exact, false);
  assertEquals((await s.handler(post({ action: 'link', previewId: '00000000-0000-4000-8000-999999999999', platform: 'spotify' }))).status, 404);
  assertEquals((await s.handler(post({ action: 'link', previewId: 'nao-e-uuid', platform: 'spotify' }))).status, 400);
});

Deno.test('prévia: renova se o link da Deezer já vai vencer; ação audio devolve uma nova', async () => {
  const s = setup();
  await s.handler(post({ action: 'deck' }));
  // Checada agora, mas o link vence em 2 min: renova no próximo deck.
  const soon = Math.floor(NOW.getTime() / 1000) + 120;
  for (const r of s.rows.values()) {
    r.store_checked_at = NOW.toISOString();
    r.audio_url = `https://cdnt-preview.dzcdn.net/x.mp3?hdnea=exp=${soon}~hmac=1`;
  }
  const body = await (await s.handler(post({ action: 'deck' }))).json();
  assertEquals(s.calls.byId, 2);
  assertEquals(body.cards[0].audio_url.endsWith('-novo.mp3'), true);

  const id = body.cards[0].link_preview_id;
  const res = await (await s.handler(post({ action: 'audio', previewId: id }))).json();
  assertEquals(res.audio_url.endsWith('-novo.mp3'), true);
  assertEquals(s.calls.byId, 3);
  assertEquals((await s.handler(post({ action: 'audio', previewId: 'x' }))).status, 400);
  assertEquals((await s.handler(post({ action: 'audio', previewId: '00000000-0000-4000-8000-999999999999' }))).status, 404);
});

Deno.test('prévia de música de outra plataforma (indicação da comunidade): acha na Deezer e guarda a busca', async () => {
  const s = setup();
  const spotifyId = '00000000-0000-4000-8000-0000000000aa';
  s.rows.set(spotifyId, {
    id: spotifyId,
    url: 'https://open.spotify.com/track/abc',
    platform: 'spotify',
    provider_id: null,
    title: 'Midnight City',
    artist: 'M83',
    album: null,
    image_url: null,
    artist_image_url: null,
    audio_url: null,
    genres: null,
    store_checked_at: null,
  });
  const res = await (await s.handler(post({ action: 'audio', previewId: spotifyId }))).json();
  assertEquals(typeof res.audio_url, 'string');
  assertEquals(res.audio_url.startsWith('https://'), true);
  assertEquals(s.calls.find, 1);
  // Na segunda vez usa a busca guardada (não procura de novo na Deezer).
  const again = await (await s.handler(post({ action: 'audio', previewId: spotifyId }))).json();
  assertEquals(again.audio_url, res.audio_url);
  assertEquals(s.calls.find, 1);
});

Deno.test('prévia de outra plataforma que a Deezer não tem: null (o app avisa)', async () => {
  const s = setup();
  const id = '00000000-0000-4000-8000-0000000000ab';
  s.rows.set(id, {
    id, url: 'https://youtu.be/x', platform: 'youtube', provider_id: null, title: 'Inexistente', artist: 'Ninguém', album: null,
    image_url: null, artist_image_url: null, audio_url: null, genres: null, store_checked_at: null,
  });
  const res = await (await s.handler(post({ action: 'audio', previewId: id }))).json();
  assertEquals(res.audio_url, null);
});

Deno.test('gênero: descarta o que a Deezer diz ser de outro gênero (funk americano no funk brasileiro)', async () => {
  // "Americana" vem de um álbum Soul & Funk (169); a outra, de Música Brasileira (75).
  const s = setup({
    recommend: async () => [cand('MC Br', 'Baile', { kind: 'genre', genre: 'funk_br' }), cand('Americana', 'Groove', { kind: 'genre', genre: 'funk_br' })],
    albumGenres: async (albumId) => (albumId === '1020' ? [169] : [75]),
  });
  const body = await (await s.handler(post({ action: 'deck', genre: 'funk_br' }))).json();
  assertEquals(body.cards.map((c: { title: string }) => c.title), ['Baile']);
  // O que foi conferido fica guardado no cartão.
  assertEquals([...s.rows.values()].map((r) => r.store_genre_ids), [[75], [169]]);
});

Deno.test('gênero: cartão já conferido não pergunta de novo à Deezer; gênero sem conferência nem pergunta', async () => {
  const s = setup({ recommend: async () => [cand('MC Br', 'Baile', { kind: 'genre', genre: 'funk_br' })] });
  await s.handler(post({ action: 'deck', genre: 'funk_br' }));
  assertEquals(s.calls.albums, 1);
  const again = setup({ recommend: async () => [cand('Banda', 'Indie', { kind: 'genre', genre: 'shoegaze' })] });
  await again.handler(post({ action: 'deck', genre: 'shoegaze' }));
  assertEquals(again.calls.albums, 0);
});

Deno.test('álbuns: busca pelo nome, escolhe e guarda o cartão; entradas inválidas', async () => {
  const { handler } = setup();
  const found = await (await handler(post({ action: 'albums', query: 'discovery' }))).json();
  assertEquals(found, { albums: [{ id: '302127', title: 'Discovery', artist: 'Daft Punk', image_url: null, record_type: 'album' }] });
  assertEquals(await (await handler(post({ action: 'albums', query: 'a' }))).json(), { albums: [] });
  assertEquals((await handler(post({ action: 'albums', query: 'cota' }))).status, 429);
  assertEquals((await handler(post({ action: 'albums', query: 42 }))).status, 400);

  const saved = await (await handler(post({ action: 'album', albumId: '302127' }))).json();
  assertEquals(saved.album.release_year, 2001);
  assertEquals(saved.album.kind, 'album');
  assertEquals((await handler(post({ action: 'album', albumId: '999' }))).status, 404);
  assertEquals((await handler(post({ action: 'album', albumId: '../x' }))).status, 400);
  assertEquals((await handler(post({ action: 'album', albumId: '302127' }, ''))).status, 401);
});

Deno.test('álbuns: respeita o limite de pedidos', async () => {
  const seen: string[] = [];
  const { handler } = setup({ rateLimit: async (_u, a) => (seen.push(a), a !== 'albums') });
  assertEquals((await handler(post({ action: 'albums', query: 'discovery' }))).status, 429);
  assertEquals(seen, ['albums']);
});

Deno.test('músicas favoritas: busca pelo nome e guarda a escolhida; entradas inválidas', async () => {
  const { handler } = setup();
  const found = await (await handler(post({ action: 'tracks', query: 'harder' }))).json();
  assertEquals(found.tracks[0], { id: '3135556', title: 'Harder, Better, Faster, Stronger', artist: 'Daft Punk', album: 'Harder, Better, Faster, Stronger (álbum)', image_url: 'https://e-cdns-images.dzcdn.net/images/cover/x/500x500.jpg' });
  assertEquals((await handler(post({ action: 'tracks', query: 'cota' }))).status, 429);
  assertEquals((await handler(post({ action: 'tracks' }))).status, 400);
  const saved = await (await handler(post({ action: 'track', trackId: '3135556' }))).json();
  assertEquals(saved.song.id, 'song-1');
  assertEquals((await handler(post({ action: 'track', trackId: 'abc' }))).status, 400);
});

Deno.test('gênero silenciado: some do deck e não puxa sugestões; buscar o gênero de propósito mostra', async () => {
  const seedsSeen: string[][] = [];
  const muted = setup({
    seeds: async () => ({ genres: ['rock', 'jazz'], liked: [{ artist: 'Banda', title: 'Curtida' }], seenKeys: [], seenPreviewIds: [], mutedGenres: ['rock'] }),
    recommend: async (s, _size, genre) => {
      seedsSeen.push(s.genres);
      return [
        cand('Banda', 'Parecida', { kind: 'similar', because: { artist: 'Banda', title: 'Curtida' } }),
        cand('Outra', 'Do Gênero', { kind: 'genre', genre: genre ?? 'rock' }),
      ];
    },
  });
  const titles = async (body: unknown) => (await (await muted.handler(post(body))).json()).cards.map((c: { title: string }) => c.title);
  assertEquals(await titles({ action: 'deck' }), ['Parecida']);
  assertEquals(seedsSeen[0], ['jazz']);
  // Busca do gênero no topo da tela: a pessoa pediu, então aparece.
  assertEquals(await titles({ action: 'deck', genre: 'rock' }), ['Parecida', 'Do Gênero']);
});

/** Plataforma da pessoa + guarda do que foi achado nas plataformas (platform_tracks). */
function withPlatform(platform: StreamingChoice | null, extra: Partial<Deps> = {}) {
  const saved = new Map<string, { found: boolean; url: string | null; image_url: string | null; audio_url: string | null }>();
  const calls = { apple: 0, cover: 0, songlink: 0 };
  const base = setup({
    platformOf: async () => platform,
    findPlatformTracks: async (ids, p) => new Map(ids.filter((id) => saved.has(`${p}:${id}`)).map((id) => [id, saved.get(`${p}:${id}`)!])),
    savePlatformTrack: async (id, p, t) => void saved.set(`${p}:${id}`, t),
    appleTrack: async (ref) => {
      calls.apple++;
      return ref.title === 'Parecida'
        ? { url: 'https://music.apple.com/br/album/x/1?i=2', imageUrl: 'https://is1-ssl.mzstatic.com/a/600x600bb.jpg', previewUrl: 'https://audio-ssl.itunes.apple.com/p.m4a' }
        : null;
    },
    coverOf: async (url) => {
      calls.cover++;
      return url.includes('spotify') ? 'https://i.scdn.co/image/capa' : null;
    },
    fetchLinks: async () => {
      calls.songlink++;
      return { links: { spotify: 'https://open.spotify.com/track/abc' }, images: {} };
    },
    ...extra,
  });
  return { ...base, saved, platformCalls: calls };
}

type Card = { link_preview_id: string; title: string; url: string; platform: string; image_url: string | null; artist_image_url: string | null; audio_url: string | null; preview_platform: string | null };
const deckOf = async (h: (r: Request) => Promise<Response>) => (await (await h(post({ action: 'deck' }))).json()).cards as Card[];

Deno.test('Apple Music: link e prévia da Apple (a capa é do Last.fm); o que não está na Apple fica de fora; da segunda vez, do cache', async () => {
  const s = withPlatform('apple_music');
  const cards = await deckOf(s.handler);
  assertEquals(
    cards.map((c) => [c.title, c.platform, c.url, c.image_url, c.audio_url, c.preview_platform, c.artist_image_url]),
    [['Parecida', 'apple_music', 'https://music.apple.com/br/album/x/1?i=2', LASTFM_COVER, 'https://audio-ssl.itunes.apple.com/p.m4a', 'apple_music', null]],
  );
  const before = s.platformCalls.apple;
  await deckOf(s.handler);
  assertEquals(s.platformCalls.apple, before, 'segunda pilha sem buscar na Apple de novo');
  // Nenhuma prévia da Deezer foi renovada para quem usa Apple.
  assertEquals(s.calls.byId, 0);
});

Deno.test('Spotify (sem prévia): link do Spotify, nunca áudio; a capa vem do Last.fm, não da plataforma', async () => {
  const s = withPlatform('spotify', { fetchLinks: async () => ({ links: { spotify: 'https://open.spotify.com/track/abc' }, images: { spotify: 'https://i.scdn.co/image/do-spotify' } }) });
  const cards = await deckOf(s.handler);
  assertEquals(cards.length, 2);
  assertEquals(cards.map((c) => c.image_url), [LASTFM_COVER, DEEZER_COVER], 'Last.fm primeiro; sem ele, a Deezer; nunca a capa do Spotify');
  for (const c of cards) {
    assertEquals([c.platform, c.url, c.audio_url, c.preview_platform], ['spotify', 'https://open.spotify.com/track/abc', null, null]);
  }
});

Deno.test('Spotify: música que o song.link não achou abre a busca do Spotify (a capa continua a do Last.fm)', async () => {
  const s = withPlatform('spotify', { fetchLinks: async () => ({ links: { deezer: 'https://www.deezer.com/track/1' }, images: {} }) });
  const cards = await deckOf(s.handler);
  for (const c of cards) {
    assertEquals([c.platform, c.url.startsWith('https://open.spotify.com/search/'), !!c.image_url, c.audio_url], ['spotify', true, true, null]);
  }
});

Deno.test('sem plataforma escolhida: sem prévia, mas com os dados do Last.fm', async () => {
  const s = withPlatform(null);
  const cards = await deckOf(s.handler);
  assertEquals(cards.length, 2);
  for (const c of cards) assertEquals([c.audio_url, c.preview_platform], [null, null]);
  assertEquals(cards[0]!.image_url, LASTFM_COVER);
});

Deno.test('prévia renovada só da plataforma da pessoa', async () => {
  // Spotify: nenhuma prévia (nem a da Deezer).
  const spotify = withPlatform('spotify');
  const sid = (await deckOf(spotify.handler))[0]!.link_preview_id;
  assertEquals((await (await spotify.handler(post({ action: 'audio', previewId: sid }))).json()).audio_url, null);
  // Apple: a prévia da Apple.
  const apple = withPlatform('apple_music');
  const aid = (await deckOf(apple.handler))[0]!.link_preview_id;
  assertEquals((await (await apple.handler(post({ action: 'audio', previewId: aid }))).json()).audio_url, 'https://audio-ssl.itunes.apple.com/p.m4a');
});

Deno.test('abrir no Spotify guarda o link e a capa: a próxima pilha já mostra a capa', async () => {
  let songlinkUp = false;
  const s = withPlatform('spotify', {
    fetchLinks: async () => {
      if (!songlinkUp) throw new Error('fora do ar');
      return { links: { spotify: 'https://open.spotify.com/track/abc' }, images: {} };
    },
  });
  // song.link fora: cartões com a busca do Spotify (nada guardado).
  const first = await deckOf(s.handler);
  assertEquals(first.map((c) => c.url.startsWith('https://open.spotify.com/search/')), [true, true]);
  assertEquals(s.saved.size, 0);
  // Volta; abrir a música resolve o link exato e guarda link + capa do Spotify.
  songlinkUp = true;
  const id = first[0]!.link_preview_id;
  assertEquals(await (await s.handler(post({ action: 'link', previewId: id, platform: 'spotify' }))).json(), { url: 'https://open.spotify.com/track/abc', exact: true });
  assertEquals(s.saved.get(`spotify:${id}`), { found: true, url: 'https://open.spotify.com/track/abc', image_url: 'https://i.scdn.co/image/capa', audio_url: null });
});

Deno.test('o song.link ainda guarda links e capas das outras plataformas sem prévia (mas o cartão mostra a capa do Last.fm)', async () => {
  const s = withPlatform('amazon_music', {
    fetchLinks: async () => ({
      links: { amazon_music: 'https://music.amazon.com/albums/B0D1?trackAsin=B0D2', spotify: 'https://open.spotify.com/track/abc', tidal: 'https://tidal.com/browse/track/1' },
      images: { amazon_music: 'https://m.media-amazon.com/images/I/capa.jpg', spotify: 'https://i.scdn.co/image/sl' },
    }),
  });
  const cards = await deckOf(s.handler);
  assertEquals(cards.map((c) => c.image_url), [LASTFM_COVER, DEEZER_COVER]);
  assertEquals(cards.map((c) => c.url), ['https://music.amazon.com/albums/B0D1?trackAsin=B0D2', 'https://music.amazon.com/albums/B0D1?trackAsin=B0D2']);
  assertEquals(s.platformCalls.cover, 0, 'não precisou ler a página do link');
  const id = cards[0]!.link_preview_id;
  assertEquals(s.saved.get(`spotify:${id}`)?.image_url, 'https://i.scdn.co/image/sl');
  // TIDAL sem capa do song.link: não guarda (a pessoa do TIDAL procura a capa na vez dela).
  assertEquals(s.saved.has(`tidal:${id}`), false);
});

Deno.test('song.link pedindo para esperar não marca a música como "não está na plataforma"', async () => {
  let up = false;
  const s = withPlatform('spotify', {
    fetchLinks: async () => {
      if (!up) throw new Error('429');
      return { links: { spotify: 'https://open.spotify.com/track/abc' }, images: { spotify: 'https://i.scdn.co/image/sl' } };
    },
  });
  await deckOf(s.handler);
  assertEquals(s.saved.size, 0);
  up = true;
  assertEquals((await deckOf(s.handler)).map((c) => c.url), ['https://open.spotify.com/track/abc', 'https://open.spotify.com/track/abc']);
});

Deno.test('a ordem da pilha não depende da plataforma; links que faltaram abrem a busca', async () => {
  const tasks: Promise<unknown>[] = [];
  let n = 0;
  const s = withPlatform('spotify', {
    // Só a primeira música tem link no Spotify agora.
    fetchLinks: async () => (n++ === 0 ? { links: { spotify: 'https://open.spotify.com/track/abc' }, images: { spotify: 'https://i.scdn.co/image/sl' } } : null),
    background: (t) => void tasks.push(t),
  });
  const cards = await deckOf(s.handler);
  assertEquals(cards.map((c) => c.title), ['Parecida', 'Do Gênero']);
  assertEquals(cards[0]!.url, 'https://open.spotify.com/track/abc');
  assertEquals(cards.at(-1)!.url.startsWith('https://open.spotify.com/search/'), true);
  assertEquals(tasks.length, 0, 'tudo coube no limite da pilha: nada para depois');
});

Deno.test('links guardados antes das capas: busca de novo no song.link', async () => {
  const saved: unknown[] = [];
  const s = withPlatform('spotify', {
    findLinks: async () => ({ links: { spotify: 'https://open.spotify.com/track/abc' }, images: null, checked_at: new Date().toISOString() }),
    saveLinks: async (_u, links, images) => void saved.push({ links, images }),
    fetchLinks: async () => ({ links: { spotify: 'https://open.spotify.com/track/abc' }, images: { spotify: 'https://i.scdn.co/image/sl' } }),
  });
  assertEquals((await deckOf(s.handler)).map((c) => c.url), ['https://open.spotify.com/track/abc', 'https://open.spotify.com/track/abc']);
  assertEquals(saved.length, 2);
});

Deno.test('Last.fm: título, artista, álbum e capa são os mesmos em qualquer plataforma; só o link e a prévia mudam', async () => {
  const meta = (c: Card & { artist: string; album: string }) => [c.title, c.artist, c.album, c.image_url];
  const seen: unknown[] = [];
  for (const platform of ['deezer', 'apple_music', 'spotify', null] as const) {
    const s = withPlatform(platform, {
      // O Last.fm corrige o nome do artista e traz o álbum e a capa dele.
      lastfmInfo: async (ref) => (ref.title === 'Parecida' ? { title: 'Parecida', artist: 'Banda Oficial', album: 'Álbum LF', imageUrl: LASTFM_COVER } : null),
    });
    const cards = (await deckOf(s.handler)) as (Card & { artist: string; album: string })[];
    seen.push(meta(cards.find((c) => c.title === 'Parecida')!));
  }
  const expected = ['Parecida', 'Banda Oficial', 'Álbum LF', LASTFM_COVER];
  for (const m of seen) assertEquals(m, expected);
});

Deno.test('Last.fm: guarda o resultado (não pergunta de novo) e, se estiver fora do ar, o cartão segue com os dados da Deezer sem guardar "não achou"', async () => {
  const s = setup();
  await s.handler(post({ action: 'deck' }));
  const first = s.calls.lastfm;
  await s.handler(post({ action: 'deck' }));
  // "Parecida" já está guardada com capa; "Do Gênero" (não achada) só é perguntada de novo depois de 7 dias.
  assertEquals(s.calls.lastfm, first, 'segunda pilha sem perguntar ao Last.fm de novo');

  const down = setup({
    lastfmInfo: async () => {
      throw new Error('lastfm_unavailable');
    },
  });
  const cards = (await (await down.handler(post({ action: 'deck' }))).json()).cards as (Card & { album: string })[];
  assertEquals(cards.map((c) => [c.title, c.album, c.image_url]), [
    ['Parecida', 'Parecida (álbum)', DEEZER_COVER],
    ['Do Gênero', 'Do Gênero (álbum)', DEEZER_COVER],
  ]);
  assertEquals(down.lastfm.size, 0, 'falha de rede não vira "o Last.fm não conhece"');
});

Deno.test('Last.fm lento: a pilha sai no prazo com os dados da Deezer e o Last.fm termina depois, em segundo plano', async () => {
  const tasks: Promise<unknown>[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const s = setup({
    lastfmBudgetMs: 20,
    background: (t) => void tasks.push(t),
    lastfmInfo: async (ref) => {
      await gate; // o Last.fm demora mais que o prazo
      return { title: ref.title, artist: 'Banda Oficial', album: 'Álbum LF', imageUrl: LASTFM_COVER };
    },
  });
  const cards = (await (await s.handler(post({ action: 'deck' }))).json()).cards as (Card & { album: string })[];
  assertEquals(cards.length > 0, true);
  for (const c of cards) assertEquals([c.album, c.image_url], [`${c.title} (álbum)`, DEEZER_COVER], 'sem esperar o Last.fm');
  assertEquals(s.lastfm.size, 0, 'ainda não chegou');
  release();
  await Promise.all(tasks);
  assertEquals(s.lastfm.size > 0, true, 'terminou em segundo plano e ficou guardado');
  const next = (await (await s.handler(post({ action: 'deck' }))).json()).cards as (Card & { album: string })[];
  for (const c of next) assertEquals([c.album, c.image_url], ['Álbum LF', LASTFM_COVER], 'a próxima pilha já sai com o Last.fm');
});
