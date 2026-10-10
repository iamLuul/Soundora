// Testes da Edge Function auth-username no Deno, com o Supabase simulado.
// npm run test:functions
import { clientIp, createHandler, maskEmail, normalizeUsername, type Action, type Deps } from './handler.ts';

function assertEquals(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recebido: ${a}`);
}

const SESSION = { access_token: 'access', refresh_token: 'refresh' };

/**
 * Limites em memória, com a mesma regra do banco (login_attempt_start): a tentativa é
 * reservada como falha antes do Auth, e a checagem + reserva acontecem de uma vez.
 */
function makeDeps(overrides: Partial<Deps> = {}) {
  const attempts: { id: number; username: string; action: Action; success: boolean; ip: string | null }[] = [];
  const sent: string[] = [];
  const ips: (string | null)[] = [];
  const deps: Deps = {
    debug: true,
    log: () => {},
    lookup: async (u) => (u === 'raul' ? { userId: 'user-1', email: 'raul.pereira@gmail.com' } : null),
    startAttempt: async (username, action, ip) => {
      const mine = attempts.filter((a) => a.username === username && a.action === action);
      const limited = action === 'send_code' ? mine.length >= 3 : mine.filter((a) => !a.success).length >= 5;
      if (limited) return null;
      const id = attempts.length + 1;
      attempts.push({ id, username, action, success: false, ip });
      return id;
    },
    finishAttempt: async (id, success) => {
      const a = attempts.find((x) => x.id === id);
      if (a) a.success = success;
    },
    signInWithPassword: async (email, password, ip) => {
      ips.push(ip);
      await new Promise((r) => setTimeout(r, 5)); // o Auth demora: abre espaço para corrida
      return email === 'raul.pereira@gmail.com' && password === 'senha-certa'
        ? { data: SESSION, error: null }
        : { data: null, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
    },
    sendCode: async (email) => {
      sent.push(email);
      return { data: true, error: null };
    },
    verifyCode: async (_email, code) =>
      code === '123456' ? { data: SESSION, error: null } : { data: null, error: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' } },
    ...overrides,
  };
  return { deps, attempts, sent, ips };
}

async function call(handler: (r: Request) => Promise<Response>, body: unknown) {
  const res = await handler(new Request('http://localhost/auth-username', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

Deno.test('entra com @usuário e senha e devolve a sessão, sem o e-mail', async () => {
  const { deps } = makeDeps();
  const res = await call(createHandler(deps), { action: 'password', username: ' @Raul ', password: 'senha-certa' });
  assertEquals(res, { status: 200, body: { session: SESSION } });
});

Deno.test('senha errada e @ inexistente dão a mesma resposta', async () => {
  const { deps } = makeDeps();
  const handler = createHandler(deps);
  const wrong = await call(handler, { action: 'password', username: 'raul', password: 'errada' });
  const missing = await call(handler, { action: 'password', username: 'ninguem', password: 'errada' });
  assertEquals(wrong, { status: 400, body: { error: 'invalid_credentials' } });
  assertEquals(missing, wrong);
});

Deno.test('bloqueia depois de 5 senhas erradas, mesmo que a 6ª esteja certa', async () => {
  const { deps } = makeDeps();
  const handler = createHandler(deps);
  for (let i = 0; i < 5; i++) await call(handler, { action: 'password', username: 'raul', password: 'errada' });
  const res = await call(handler, { action: 'password', username: 'raul', password: 'senha-certa' });
  assertEquals(res, { status: 429, body: { error: 'rate_limited' } });
});

Deno.test('envia o código para o e-mail ligado ao @ e devolve só uma dica mascarada', async () => {
  const { deps, sent } = makeDeps();
  const res = await call(createHandler(deps), { action: 'send_code', username: 'RAUL' });
  assertEquals(sent, ['raul.pereira@gmail.com']);
  assertEquals(res, { status: 200, body: { sent: true, email_hint: 'ra•••@g•••.com' } });
  if (JSON.stringify(res.body).includes('raul.pereira')) throw new Error('vazou o e-mail');
});

Deno.test('@ sem conta não recebe código', async () => {
  const { deps, sent } = makeDeps();
  const res = await call(createHandler(deps), { action: 'send_code', username: 'ninguem' });
  assertEquals(res, { status: 404, body: { error: 'no_account' } });
  assertEquals(sent, []);
});

Deno.test('no máximo 3 códigos a cada 10 minutos', async () => {
  const { deps, sent } = makeDeps();
  const handler = createHandler(deps);
  for (let i = 0; i < 3; i++) await call(handler, { action: 'send_code', username: 'raul' });
  const res = await call(handler, { action: 'send_code', username: 'raul' });
  assertEquals(res.status, 429);
  assertEquals(sent.length, 3);
});

Deno.test('código certo entra; código errado ou expirado não', async () => {
  const { deps } = makeDeps();
  const handler = createHandler(deps);
  assertEquals(await call(handler, { action: 'verify_code', username: 'raul', code: '000000' }), { status: 400, body: { error: 'invalid_code' } });
  assertEquals(await call(handler, { action: 'verify_code', username: 'raul', code: '123 456' }), { status: 200, body: { session: SESSION } });
  assertEquals(await call(handler, { action: 'verify_code', username: 'raul', code: 'abc' }), { status: 400, body: { error: 'invalid_code' } });
});

Deno.test('limite do próprio Supabase vira rate_limited; erro inesperado mostra o motivo em desenvolvimento', async () => {
  const limited = makeDeps({ sendCode: async () => ({ data: null, error: { code: 'over_email_send_rate_limit', status: 429 } }) });
  assertEquals((await call(createHandler(limited.deps), { action: 'send_code', username: 'raul' })).body, { error: 'rate_limited' });

  const broken = makeDeps({ startAttempt: () => Promise.reject(new Error('db fora do ar')) });
  assertEquals((await call(createHandler(broken.deps), { action: 'send_code', username: 'raul' })).body, {
    error: 'internal',
    detail: 'Error: db fora do ar',
  });
  const quiet = makeDeps({ debug: false, startAttempt: () => Promise.reject(new Error('db fora do ar')) });
  assertEquals((await call(createHandler(quiet.deps), { action: 'send_code', username: 'raul' })).body, { error: 'internal' });
});

Deno.test('pedidos inválidos', async () => {
  const handler = createHandler(makeDeps().deps);
  assertEquals((await call(handler, { action: 'hack', username: 'raul' })).status, 400);
  assertEquals((await call(handler, { action: 'password', username: 'raul' })).status, 400);
  assertEquals((await call(handler, { action: 'send_code' })).status, 400);
  const options = await handler(new Request('http://localhost/auth-username', { method: 'OPTIONS' }));
  assertEquals(options.status, 200);
});

Deno.test('utilitários', () => {
  assertEquals(normalizeUsername('  @Ana.Clara '), 'ana.clara');
  assertEquals(maskEmail('ab@x.com'), 'a•••@x•••.com');
  assertEquals(maskEmail('raul@gmail.com'), 'ra•••@g•••.com');
  assertEquals(maskEmail('raul@empresa.com.br'), 'ra•••@e•••.br');
});

Deno.test('50 senhas em paralelo: só 5 chegam ao Auth (corrida corrigida)', async () => {
  const { deps, ips } = makeDeps();
  const handler = createHandler(deps);
  const results = await Promise.all(Array.from({ length: 50 }, () => call(handler, { action: 'password', username: 'raul', password: 'chute' })));
  assertEquals(ips.length, 5, 'tentativas que chegaram ao Auth');
  assertEquals(results.filter((r) => r.status === 429).length, 45);
});

Deno.test('@ inexistente também gasta tentativa (não dá para sondar sem limite)', async () => {
  const { deps, attempts } = makeDeps();
  await call(createHandler(deps), { action: 'password', username: 'ninguem', password: 'x' });
  assertEquals(attempts.map((a) => [a.username, a.success]), [['ninguem', false]]);
});

Deno.test('ação "toString" ou "constructor" é pedido inválido (antes dava erro 500)', async () => {
  const handler = createHandler(makeDeps().deps);
  for (const action of ['toString', 'constructor', '__proto__']) {
    assertEquals((await call(handler, { action, username: 'raul' })).status, 400, action);
  }
});

Deno.test('o IP de quem pediu vai para o limite e para o Auth', async () => {
  const { deps, attempts, ips } = makeDeps();
  const req = new Request('http://localhost/auth-username', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    body: JSON.stringify({ action: 'password', username: 'raul', password: 'senha-certa' }),
  });
  await createHandler(deps)(req);
  assertEquals(attempts[0]?.ip, '203.0.113.7');
  assertEquals(ips, ['203.0.113.7']);
});

Deno.test('clientIp: prefere cf-connecting-ip e ignora lixo', () => {
  const req = (h: Record<string, string>) => new Request('http://x', { headers: h });
  assertEquals(clientIp(req({ 'cf-connecting-ip': '198.51.100.2', 'x-forwarded-for': '1.1.1.1' })), '198.51.100.2');
  assertEquals(clientIp(req({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1');
  assertEquals(clientIp(req({ 'x-forwarded-for': "'; drop table x; --" })), null);
  assertEquals(clientIp(req({})), null);
});

