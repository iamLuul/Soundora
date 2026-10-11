// Testes da Edge Function music-charts no Deno, com Supabase e APIs simulados.
// npm run test:functions
import { LastfmKeyError, type ChartEntry } from '../_shared/links/charts.ts';
import type { Platform } from '../_shared/links/platforms.ts';
import { createHandler, type Deps, type Snapshot } from './handler.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const entry = (key: string, position: number, deezerUrl: string | null = null): ChartEntry => ({
  position,
  key,
  title: key.toUpperCase(),
  artist: 'Artista',
  album: null,
  imageUrl: null,
  deezerUrl,
  listeners: 10,
});

const NOW = new Date('2026-10-11T12:00:00Z');

function setup(overrides: Partial<Deps> = {}, initial: Snapshot[] = []) {
  const snapshots = [...initial];
  const links = new Map<string, { links: Partial<Record<Platform, string>>; checked_at: string }>();
  const calls = { fetchChart: 0, fetchLinks: 0 };
  const deps: Deps = {
    debug: true,
    log: () => {},
    now: () => NOW,
    getUserId: async (h) => (h === 'Bearer ok' ? 'user-1' : null),
    rateLimit: async () => true,
    latestSnapshot: async () => [...snapshots].sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0] ?? null,
    previousSnapshot: async (today) => snapshots.filter((s) => s.taken_on < today).sort((a, b) => a.taken_on.localeCompare(b.taken_on))[0] ?? null,
    saveSnapshot: async (taken_on, entries) => {
      const i = snapshots.findIndex((s) => s.taken_on === taken_on);
      const row = { taken_on, fetched_at: NOW.toISOString(), entries };
      if (i >= 0) snapshots[i] = row;
      else snapshots.push(row);
    },
    fetchChart: async () => {
      calls.fetchChart++;
      return [entry('a', 1, 'https://www.deezer.com/track/1'), entry('b', 2), entry('c', 3)];
    },
    findLinks: async (u) => links.get(u) ?? null,
    saveLinks: async (u, l) => void links.set(u, { links: l, checked_at: NOW.toISOString() }),
    fetchLinks: async () => {
      calls.fetchLinks++;
      return { spotify: 'https://open.spotify.com/track/abc' };
    },
    ...overrides,
  };
  return { handler: createHandler(deps), snapshots, calls };
}

const post = (body: unknown, auth = 'Bearer ok') =>
  new Request('http://x/music-charts', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

Deno.test('sem login: 401', async () => {
  const { handler } = setup();
  assertEquals((await handler(post({ action: 'chart' }, ''))).status, 401);
});

Deno.test('ranking: busca, guarda e compara com o anterior (subiu, caiu, novo)', async () => {
  const old: Snapshot = { taken_on: '2026-10-01', fetched_at: '2026-10-01T10:00:00Z', entries: [entry('b', 1), entry('a', 2)] };
  const { handler, snapshots, calls } = setup({}, [old]);
  const res = await handler(post({ action: 'chart' }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(
    body.entries.map((e: { key: string; move: string; previous_position: number | null }) => [e.key, e.move, e.previous_position]),
    [
      ['a', 'up', 2],
      ['b', 'down', 1],
      ['c', 'new', null],
    ],
  );
  // O app não recebe o link interno da Deezer.
  assertEquals(Object.keys(body.entries[0]).includes('deezerUrl'), false);
  assertEquals(snapshots.length, 2);
  assertEquals(calls.fetchChart, 1);

  // Segundo pedido logo depois: vem do cache.
  await handler(post({ action: 'chart' }));
  assertEquals(calls.fetchChart, 1);
});

Deno.test('sem chave do Last.fm: usa o último ranking guardado; sem nenhum, 503', async () => {
  const fail = { fetchChart: () => Promise.reject(new LastfmKeyError()) };
  const empty = setup(fail);
  const r1 = await empty.handler(post({ action: 'chart' }));
  assertEquals([r1.status, (await r1.json()).error], [503, 'charts_unavailable']);

  const old: Snapshot = { taken_on: '2026-10-10', fetched_at: '2026-10-10T10:00:00Z', entries: [entry('a', 1)] };
  const stale = setup(fail, [old]);
  const r2 = await stale.handler(post({ action: 'chart' }));
  const body = await r2.json();
  assertEquals([r2.status, body.stale, body.entries.length], [200, true, 1]);
});

Deno.test('link: exato pelo song.link (com cache), busca quando não há, e só de música do ranking', async () => {
  const today: Snapshot = { taken_on: '2026-10-11', fetched_at: NOW.toISOString(), entries: [entry('a', 1, 'https://www.deezer.com/track/1'), entry('b', 2)] };
  const { handler, calls } = setup({}, [today]);

  assertEquals(await (await handler(post({ action: 'link', key: 'a', platform: 'spotify' }))).json(), {
    url: 'https://open.spotify.com/track/abc',
    exact: true,
  });
  await handler(post({ action: 'link', key: 'a', platform: 'spotify' }));
  assertEquals(calls.fetchLinks, 1, 'segunda vez vem do cache');

  assertEquals(await (await handler(post({ action: 'link', key: 'a', platform: 'deezer' }))).json(), { url: 'https://www.deezer.com/track/1', exact: true });
  assertEquals(await (await handler(post({ action: 'link', key: 'a', platform: 'tidal' }))).json(), {
    url: 'https://listen.tidal.com/search?q=A%20Artista',
    exact: false,
  });
  assertEquals((await (await handler(post({ action: 'link', key: 'b', platform: 'spotify' }))).json()).url, 'https://open.spotify.com/search/B%20Artista');

  assertEquals((await handler(post({ action: 'link', key: 'zzz', platform: 'spotify' }))).status, 404);
  assertEquals((await handler(post({ action: 'link', key: 'a', platform: 'napster' }))).status, 400);
  assertEquals((await handler(post({ action: 'outra' }))).status, 400);
});

Deno.test('limite de pedidos: 429', async () => {
  const { handler } = setup({ rateLimit: async () => false });
  assertEquals((await handler(post({ action: 'chart' }))).status, 429);
});
