// Lógica da Edge Function auth-username, separada do Deno.serve para poder ser testada
// com o Supabase simulado (handler.test.ts).
//
// Entrar com @usuário em vez de e-mail. A troca usuário → e-mail acontece só aqui, no
// servidor: o app manda o @ e recebe a sessão pronta, nunca o e-mail de outra pessoa.
// Cada @ tem limite de tentativas, para ninguém ficar chutando senha ou código.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type Action = 'password' | 'send_code' | 'verify_code';

/** Limites por @: quantas tentativas cabem em quantos minutos. */
export const LIMITS: Record<Action, { max: number; minutes: number; failuresOnly: boolean }> = {
  password: { max: 5, minutes: 15, failuresOnly: true },
  send_code: { max: 3, minutes: 10, failuresOnly: false },
  verify_code: { max: 5, minutes: 15, failuresOnly: true },
};

export interface Session {
  access_token: string;
  refresh_token: string;
}

/** Erro devolvido pelo Supabase Auth (só o que interessa aqui). */
export interface AuthFailure {
  code?: string;
  message?: string;
  status?: number;
}

export type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthFailure };

/** O que o handler precisa do mundo externo. Em produção vem do Supabase; nos testes, de fakes. */
export interface Deps {
  /** E-mail da conta dona do @ (já normalizado), ou null. */
  lookup(username: string): Promise<{ userId: string; email: string } | null>;
  countAttempts(username: string, action: Action, minutes: number, failuresOnly: boolean): Promise<number>;
  recordAttempt(username: string, action: Action, success: boolean): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<AuthResult<Session>>;
  sendCode(email: string): Promise<AuthResult<true>>;
  verifyCode(email: string, code: string): Promise<AuthResult<Session>>;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

const USERNAME = /^[a-z0-9_.]{3,20}$/;

/** "@Ana.Clara " → "ana.clara" */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

/** "raul.pereira@gmail.com" → "ra•••@gmail.com": mostra para onde o código foi, sem entregar o e-mail (nem o tamanho). */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const visible = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return `${visible}•••@${domain}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object') return JSON.stringify(err);
  return String(err);
}

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit']);

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const detail = (err: unknown) => (deps.debug ? { detail: describe(err) } : {});

  /** Traduz o erro do Supabase Auth num código que o app conhece. */
  function authError(action: Action, err: AuthFailure): Response {
    const code = err.code ?? '';
    if (RATE_LIMIT_CODES.has(code) || err.status === 429) return json({ error: 'rate_limited' }, 429);
    if (code === 'email_not_confirmed') return json({ error: 'email_not_confirmed' }, 400);
    if (action === 'password' && (code === 'invalid_credentials' || err.status === 400)) {
      return json({ error: 'invalid_credentials' }, 400);
    }
    if (action === 'verify_code' && (code === 'otp_expired' || code === 'invalid_credentials' || err.status === 400 || err.status === 403)) {
      return json({ error: 'invalid_code' }, 400);
    }
    log('auth-username: erro do Auth', action, err);
    return json({ error: 'internal', ...detail(err) }, 500);
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) ?? {};
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }

    const action = body.action as Action;
    if (!(action in LIMITS)) return json({ error: 'invalid_body' }, 400);
    const username = typeof body.username === 'string' ? normalizeUsername(body.username.slice(0, 64)) : '';
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '').slice(0, 10) : '';
    if (!username) return json({ error: 'invalid_body' }, 400);
    if (action === 'password' && !password) return json({ error: 'invalid_body' }, 400);
    if (action === 'verify_code' && !/^\d{6,10}$/.test(code)) return json({ error: 'invalid_code' }, 400);

    // Mesma resposta para @ inexistente e senha errada: não confirma quem tem conta pela senha.
    const notFound = () =>
      action === 'password' ? json({ error: 'invalid_credentials' }, 400) : action === 'verify_code' ? json({ error: 'invalid_code' }, 400) : json({ error: 'no_account' }, 404);
    if (!USERNAME.test(username)) return notFound();

    try {
      const limit = LIMITS[action];
      const recent = await deps.countAttempts(username, action, limit.minutes, limit.failuresOnly);
      if (recent >= limit.max) return json({ error: 'rate_limited', retry_after_minutes: limit.minutes }, 429);

      const account = await deps.lookup(username);
      if (!account) {
        await deps.recordAttempt(username, action, false);
        return notFound();
      }

      if (action === 'password') {
        const res = await deps.signInWithPassword(account.email, password);
        await deps.recordAttempt(username, action, !res.error);
        return res.error ? authError(action, res.error) : json({ session: res.data });
      }

      if (action === 'send_code') {
        const res = await deps.sendCode(account.email);
        await deps.recordAttempt(username, action, !res.error);
        return res.error ? authError(action, res.error) : json({ sent: true, email_hint: maskEmail(account.email) });
      }

      const res = await deps.verifyCode(account.email, code);
      await deps.recordAttempt(username, action, !res.error);
      return res.error ? authError(action, res.error) : json({ session: res.data });
    } catch (err) {
      log('auth-username: erro', action, err);
      return json({ error: 'internal', ...detail(err) }, 500);
    }
  };
}
