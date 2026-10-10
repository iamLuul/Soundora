// Testes da Edge Function delete-account no Deno, com o Supabase simulado.
// npm run test:functions
import { createHandler, type Deps } from './handler.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const USER = '11111111-1111-1111-1111-111111111111';
const NOW = Date.parse('2026-10-10T12:00:00Z');

function makeDeps(overrides: Partial<Deps> = {}) {
  const removed: string[] = [];
  const deleted: string[] = [];
  const files: Record<string, string[]> = { avatars: ['avatar-1.jpg'], banners: ['banner-1.jpg', 'banner-2.png'] };
  const deps: Deps = {
    debug: true,
    log: () => {},
    now: () => NOW,
    getUser: async (h) => (h === 'Bearer valido' ? { id: USER, email: 'raul@x.com', lastSignInAt: '2026-10-10T11:50:00Z' } : null),
    rateLimit: async () => true,
    getUsername: async () => 'raul',
    listFiles: async (bucket) => files[bucket] ?? [],
    removeFiles: async (bucket, paths) => void removed.push(...paths.map((p) => `${bucket}/${p}`)),
    deleteUser: async (id) => void deleted.push(id),
    ...overrides,
  };
  return { deps, removed, deleted };
}

async function call(deps: Deps, body: unknown, auth = 'Bearer valido') {
  const res = await createHandler(deps)(new Request('http://localhost/delete-account', { method: 'POST', headers: { Authorization: auth }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

Deno.test('confirma com o @ e apaga arquivos e usuário', async () => {
  const { deps, removed, deleted } = makeDeps();
  assertEquals(await call(deps, { confirm: '@Raul' }), { status: 200, body: { deleted: true } });
  assertEquals(removed, [`avatars/${USER}/avatar-1.jpg`, `banners/${USER}/banner-1.jpg`, `banners/${USER}/banner-2.png`]);
  assertEquals(deleted, [USER]);
});

Deno.test('sem login, @ errado ou login antigo: nada é apagado', async () => {
  const { deps, removed, deleted } = makeDeps();
  assertEquals((await call(deps, { confirm: 'raul' }, 'Bearer outro')).status, 401);
  assertEquals(await call(deps, { confirm: 'outra_pessoa' }), { status: 400, body: { error: 'confirmation_mismatch' } });
  assertEquals(await call(deps, {}), { status: 400, body: { error: 'confirmation_mismatch' } });
  const old = makeDeps({ getUser: async () => ({ id: USER, email: 'raul@x.com', lastSignInAt: '2026-10-09T12:00:00Z' }) });
  assertEquals(await call(old.deps, { confirm: 'raul' }), { status: 403, body: { error: 'reauth_required' } });
  assertEquals([removed, deleted, old.removed, old.deleted], [[], [], [], []]);
});

Deno.test('quem não terminou o cadastro confirma com o e-mail', async () => {
  const { deps, deleted } = makeDeps({ getUsername: async () => null });
  assertEquals((await call(deps, { confirm: 'RAUL@x.com' })).status, 200);
  assertEquals(deleted, [USER]);
});

Deno.test('limite de pedidos e erro do Storage não apagam o usuário', async () => {
  const limited = makeDeps({ rateLimit: async () => false });
  assertEquals((await call(limited.deps, { confirm: 'raul' })).status, 429);
  const broken = makeDeps({ removeFiles: () => Promise.reject(new Error('storage fora do ar')) });
  assertEquals(await call(broken.deps, { confirm: 'raul' }), { status: 500, body: { error: 'internal', detail: 'Error: storage fora do ar' } });
  assertEquals([limited.deleted, broken.deleted], [[], []]);
});
