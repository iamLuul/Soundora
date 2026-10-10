// Lógica da Edge Function auth-username, separada do Deno.serve para poder ser testada
// com o Supabase simulado (handler.test.ts).
//
// Entrar com @usuário em vez de e-mail. A troca usuário → e-mail acontece só aqui, no
// servidor: o app manda o @ e recebe a sessão pronta, nunca o e-mail de outra pessoa.
//
// Limites (no banco, login_attempt_start): por @ e por IP, reservados ANTES de falar com o
// Supabase Auth. A tentativa nasce como falha e só vira sucesso no fim, então pedidos
// simultâneos não furam o limite.
import { readJsonLimited } from '../_shared/body.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type Action = 'password' | 'send_code' | 'verify_code';
const ACTIONS: readonly Action[] = ['password', 'send_code', 'verify_code'];

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
  /** Reserva uma tentativa (já contada como falha). null = passou do limite. */
  startAttempt(username: string, action: Action, ip: string | null): Promise<string | number | null>;
  finishAttempt(id: string | number, success: boolean): Promise<void>;
  /** `ip`: IP de quem fez o pedido, repassado ao Supabase Auth. */
  signInWithPassword(email: string, password: string, ip: string | null): Promise<AuthResult<Session>>;
  sendCode(email: string, ip: string | null): Promise<AuthResult<true>>;
  verifyCode(email: string, code: string, ip: string | null): Promise<AuthResult<Session>>;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

const USERNAME = /^[a-z0-9_.]{3,20}$/;
const IP = /^[0-9a-f.:]{3,45}$/i;

/** "@Ana.Clara " → "ana.clara" */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

/**
 * "raul.pereira@gmail.com" → "ra•••@g•••.com": mostra para onde o código foi sem entregar
 * o e-mail, o tamanho nem o provedor.
 */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const visible = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${visible}•••@${domain.slice(0, 1)}•••${tld}`;
}

/**
 * IP de quem fez o pedido, como o Supabase informa à Edge Function. Usado nos limites por IP
 * e repassado ao Supabase Auth. Valores estranhos viram null (não quebram o limite por @).
 */
export function clientIp(req: Request): string | null {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const c of candidates) {
    const ip = c?.trim();
    if (ip && IP.test(ip)) return ip;
  }
  return null;
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

    const read = await readJsonLimited(req, 4 * 1024);
    if (!read.ok) return json({ error: read.error }, read.error === 'payload_too_large' ? 413 : 400);
    const body = (read.value && typeof read.value === 'object' ? read.value : {}) as Record<string, unknown>;

    // Object.hasOwn/includes: "toString" ou "constructor" não passam por ação válida.
    const action = ACTIONS.includes(body.action as Action) ? (body.action as Action) : null;
    if (!action) return json({ error: 'invalid_body' }, 400);
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

    const ip = clientIp(req);
    try {
      // Reserva ANTES de qualquer outra coisa (inclusive de saber se o @ existe).
      const attempt = await deps.startAttempt(username, action, ip);
      if (attempt === null) return json({ error: 'rate_limited' }, 429);

      const account = await deps.lookup(username);
      if (!account) return notFound(); // a tentativa fica como falha

      if (action === 'password') {
        const res = await deps.signInWithPassword(account.email, password, ip);
        await deps.finishAttempt(attempt, !res.error);
        return res.error ? authError(action, res.error) : json({ session: res.data });
      }

      if (action === 'send_code') {
        const res = await deps.sendCode(account.email, ip);
        await deps.finishAttempt(attempt, !res.error);
        return res.error ? authError(action, res.error) : json({ sent: true, email_hint: maskEmail(account.email) });
      }

      const res = await deps.verifyCode(account.email, code, ip);
      await deps.finishAttempt(attempt, !res.error);
      return res.error ? authError(action, res.error) : json({ session: res.data });
    } catch (err) {
      log('auth-username: erro', action, err);
      return json({ error: 'internal', ...detail(err) }, 500);
    }
  };
}
