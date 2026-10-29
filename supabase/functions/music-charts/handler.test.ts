// Testes da Edge Function music-charts no Deno, com Supabase e APIs simulados.
// npm run test:functions
import { LastfmKeyError, type ChartEntry } from '../_shared/links/charts.ts';
import type { Platform } from '../_shared/links/platforms.ts';
import { aggregateChart, createDailyHandler, createHandler, type Deps, type Snapshot } from './handler.ts';

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
  appleUrl: null,
  listeners: 10,
});

const NOW = new Date('2026-10-11T12:00:00Z');

function setup(overrides: Partial<Deps> = {}, initial: Snapshot[] = []) {
  const snapshots = [...initial];
  const links = new Map<string, { links: Partial<Record<Platform, string>>; checked_at: string }>();
  const calls = { fetchChart: 0, fetchLinks: 0, findMeta: 0, sources: [] as string[] };
  const deps: Deps = {
    debug: true,
    log: () => {},
    now: () => NOW,
    getUserId: async (h) => (h === 'Bearer ok' ? 'user-1' : null),
    rateLimit: async () => true,
    latestSnapshot: async () => [...snapshots].sort((a, b) => b.taken_on.localeCompare(a.taken_on))[0] ?? null,
    ranking: async (from, to) => aggregateChart(snapshots.filter((s) => s.taken_on >= from && s.taken_on <= to)),
    findEntry: async (key) =>
      [...snapshots].sort((a, b) => b.taken_on.localeCompare(a.taken_on)).flatMap((s) => s.entries).find((e) => e.key === key) ?? null,
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
    fetchLinks: async (source) => {
      calls.fetchLinks++;
      calls.sources.push(source);
      return { spotify: 'https://open.spotify.com/track/abc' };
    },
    findMeta: async () => {
      calls.findMeta++;
      return { album: null, imageUrl: null, deezerUrl: null, appleUrl: null };
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
  // Sem link de origem: procura a música de novo; sem achar, abre a busca.
  assertEquals((await (await handler(post({ action: 'link', key: 'b', platform: 'spotify' }))).json()).url, 'https://open.spotify.com/search/B%20Artista');
  assertEquals(calls.findMeta, 1);

  assertEquals((await handler(post({ action: 'link', key: 'zzz', platform: 'spotify' }))).status, 404);
  assertEquals((await handler(post({ action: 'link', key: 'a', platform: 'napster' }))).status, 400);
  assertEquals((await handler(post({ action: 'outra' }))).status, 400);
});

Deno.test('limite de pedidos: 429', async () => {
  const { handler } = setup({ rateLimit: async () => false });
  assertEquals((await handler(post({ action: 'chart' }))).status, 429);
});

Deno.test('link pela Apple Music quando a Deezer não achou; e música sem link é procurada de novo na hora', async () => {
  const apple = 'https://music.apple.com/us/album/x/1?i=2';
  const today: Snapshot = {
    taken_on: '2026-10-11',
    fetched_at: NOW.toISOString(),
    entries: [{ ...entry('a', 1), appleUrl: apple }, entry('b', 2)],
  };
  const { handler, calls } = setup(
    { findMeta: async () => ({ album: null, imageUrl: null, deezerUrl: 'https://www.deezer.com/track/9', appleUrl: null }) },
    [today],
  );
  assertEquals(await (await handler(post({ action: 'link', key: 'a', platform: 'apple_music' }))).json(), { url: apple, exact: true });
  assertEquals((await (await handler(post({ action: 'link', key: 'a', platform: 'spotify' }))).json()).url, 'https://open.spotify.com/track/abc');
  assertEquals(calls.sources, [apple]);
  assertEquals((await (await handler(post({ action: 'link', key: 'b', platform: 'spotify' }))).json()).exact, true);
  assertEquals(calls.sources, [apple, 'https://www.deezer.com/track/9']);
});

Deno.test('ranking vencido: mostra o guardado e atualiza por trás; formato antigo é buscado de novo na hora', async () => {
  const tasks: Promise<unknown>[] = [];
  const old: Snapshot = { taken_on: '2026-10-11', fetched_at: '2026-10-11T05:00:00Z', entries: [entry('z', 1)] };
  const { handler, calls } = setup({ background: (t) => void tasks.push(t) }, [old]);
  const body = await (await handler(post({ action: 'chart' }))).json();
  // Responde na hora com o guardado (stale); a conta da semana já pode incluir a foto nova.
  assertEquals(body.stale, true);
  await Promise.all(tasks);
  assertEquals(calls.fetchChart, 1);
  assertEquals((await (await handler(post({ action: 'chart' }))).json()).entries[0].key, 'a');

  // Salvo por uma versão anterior (sem appleUrl): não serve, busca na hora.
  const legacy = { taken_on: '2026-10-11', fetched_at: NOW.toISOString(), entries: [{ position: 1, key: 'y', title: 'Y', artist: 'A' }] } as unknown as Snapshot;
  const second = setup({ background: (t) => void tasks.push(t) }, [legacy]);
  const fresh = await (await second.handler(post({ action: 'chart' }))).json();
  assertEquals([fresh.stale, fresh.entries[0].key, second.calls.fetchChart], [false, 'a', 1]);
});

const day = (taken_on: string, keys: string[]): Snapshot => ({ taken_on, fetched_at: `${taken_on}T10:00:00Z`, entries: keys.map((k, i) => entry(k, i + 1)) });

Deno.test('pontos por posição: constância ganha de um dia só no topo; empate por dias e melhor posição', () => {
  // x: 1º num dia só (50 pontos). y: 2º em dois dias (49 + 49 = 98). z: 3º em dois dias (96).
  const r = aggregateChart([day('2026-10-01', ['x', 'y', 'z']), day('2026-10-02', ['w', 'y', 'z'])]);
  assertEquals(
    r.entries.map((e) => [e.key, e.position]),
    [
      ['y', 1],
      ['z', 2],
      ['w', 3],
      ['x', 4],
    ],
  );
  assertEquals(r.days, 2);
  // Empate de pontos: quem ficou mais dias vem antes.
  const tie = aggregateChart([day('2026-10-01', ['a']), day('2026-10-02', ['b', 'c']), day('2026-10-03', ['b'])].map((s) => s));
  assertEquals(tie.entries[0].key, 'b');
});

Deno.test('mês = últimos 30 dias: o que ficou fora da janela não conta; subiu/caiu vs. os 30 dias antes', async () => {
  const snaps = [day('2026-08-20', ['old']), day('2026-09-01', ['b', 'a']), day('2026-09-20', ['a', 'b']), day('2026-10-01', ['a', 'b'])];
  const { handler } = setup({ fetchChart: async () => [entry('a', 1), entry('b', 2)] }, snaps);
  const body = await (await handler(post({ action: 'chart', period: 'month' }))).json();
  assertEquals(body.period, 'month');
  // Janela 2026-09-12..2026-10-11: dias 09-20, 10-01 e 10-11 (o de hoje).
  assertEquals(body.days, 3);
  assertEquals(
    body.entries.map((e: { key: string; move: string }) => [e.key, e.move]),
    [
      ['a', 'up'],
      ['b', 'down'],
    ],
  );
});

Deno.test('ano = últimos 360 dias, sem subiu/caiu; período inválido: 400', async () => {
  const { handler } = setup({}, [day('2025-10-10', ['velha']), day('2026-01-01', ['a'])]);
  const body = await (await handler(post({ action: 'chart', period: 'year' }))).json();
  assertEquals(body.entries.some((e: { key: string }) => e.key === 'velha'), false);
  assertEquals(
    body.entries.every((e: { move: unknown }) => e.move === null),
    true,
  );
  assertEquals((await handler(post({ action: 'chart', period: 'decada' }))).status, 400);
});

Deno.test('link de música do mês que já saiu do ranking de hoje', async () => {
  const { handler } = setup({}, [day('2026-10-01', ['sumiu']), { taken_on: '2026-10-11', fetched_at: NOW.toISOString(), entries: [entry('a', 1)] }]);
  const r = await handler(post({ action: 'link', key: 'sumiu', platform: 'spotify' }));
  assertEquals(r.status, 200);
});

Deno.test('foto diária: só com o segredo; não busca de novo se a de hoje é recente', async () => {
  const SECRET = 'x'.repeat(40);
  const snaps: Snapshot[] = [];
  let fetched = 0;
  const daily = createDailyHandler({
    secret: SECRET,
    now: () => NOW,
    log: () => {},
    latestSnapshot: async () => snaps.at(-1) ?? null,
    saveSnapshot: async (taken_on, entries) => void snaps.push({ taken_on, fetched_at: NOW.toISOString(), entries }),
    fetchChart: async () => {
      fetched++;
      return [entry('a', 1)];
    },
  });
  const req = (secret?: string) => new Request('http://x/music-charts-daily', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} });
  assertEquals((await daily(req())).status, 403);
  assertEquals((await daily(req('errado'))).status, 403);
  assertEquals((await daily(req(SECRET))).status, 200);
  assertEquals([fetched, snaps.length, snaps[0]?.taken_on], [1, 1, '2026-10-11']);
  assertEquals((await (await daily(req(SECRET))).json()).skipped, true);
  assertEquals(fetched, 1);
  // Sem segredo configurado (ou curto demais): ninguém entra.
  const open = createDailyHandler({ secret: 'curto', latestSnapshot: async () => null, saveSnapshot: async () => {}, fetchChart: async () => [] });
  assertEquals((await open(req('curto'))).status, 403);
});
