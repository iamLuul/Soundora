// Fluxos de cadastro e login.
//
// Cadastro: e-mail + senha + confirmar senha → código de 6 dígitos no e-mail → onboarding.
// Login: e-mail OU @usuário, com senha OU código por e-mail.
// Com @usuário, quem acha o e-mail é a Edge Function auth-username, no servidor: o app
// só recebe a sessão (e, no código, uma dica mascarada como "ra•••@gmail.com").
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AppError } from './errors';
import { supabase } from './supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export type Identifier = { kind: 'email'; email: string } | { kind: 'username'; username: string };

/** "Raul@Gmail.com" → e-mail; "@raul" ou "raul" → usuário; o resto → null. */
export function parseIdentifier(input: string): Identifier | null {
  const value = input.trim().toLowerCase();
  if (value.includes('@') && !value.startsWith('@')) return EMAIL_RE.test(value) ? { kind: 'email', email: value } : null;
  const username = value.replace(/^@/, '');
  return USERNAME_RE.test(username) ? { kind: 'username', username } : null;
}

export function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim().toLowerCase());
}

type UsernameAction =
  | { action: 'password'; username: string; password: string }
  | { action: 'send_code'; username: string }
  | { action: 'verify_code'; username: string; code: string };

async function callUsernameAuth<T>(body: UsernameAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('auth-username', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const payload = await res.json().catch(() => null);
      const code = typeof payload?.error === 'string' ? payload.error : 'generic';
      throw new AppError(code, `auth-username HTTP ${res.status}${payload?.detail ? ` – ${payload.detail}` : ''}`);
    }
    // A função não respondeu (não está rodando ou não foi publicada).
    throw new AppError('auth_unavailable', `${error.name}: ${error.message}`);
  }
  if (!data) throw new AppError('generic');
  return data;
}

async function applySession(session: { access_token: string; refresh_token: string }) {
  const { error } = await supabase.auth.setSession(session);
  if (error) throw error;
}

// ---------- Cadastro ----------

/**
 * Cria a conta. Devolve 'verify' quando falta confirmar o código do e-mail (o normal),
 * ou 'done' se o servidor estiver com a confirmação desligada e já entrou.
 */
export async function signUp(email: string, password: string, locale: string): Promise<'verify' | 'done'> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { locale } } });
  if (error) throw error;
  // Com a confirmação ligada, e-mail já cadastrado volta "sem erro" mas sem identidades.
  if (data.user && data.user.identities?.length === 0) throw new AppError('email_exists');
  return data.session ? 'done' : 'verify';
}

export async function verifySignUpCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

export async function resendSignUpCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

// ---------- Login ----------

export async function signInWithPassword(id: Identifier, password: string): Promise<void> {
  if (id.kind === 'email') {
    const { error } = await supabase.auth.signInWithPassword({ email: id.email, password });
    if (error) throw error;
    return;
  }
  const { session } = await callUsernameAuth<{ session: { access_token: string; refresh_token: string } }>({
    action: 'password',
    username: id.username,
    password,
  });
  await applySession(session);
}

/** Envia o código de login. Devolve para onde foi (o e-mail digitado, ou a dica mascarada do @). */
export async function sendLoginCode(id: Identifier): Promise<string> {
  if (id.kind === 'email') {
    // Login não cria conta: quem não tem conta usa "Criar conta" (com senha).
    const { error } = await supabase.auth.signInWithOtp({ email: id.email, options: { shouldCreateUser: false } });
    if (error) throw error;
    return id.email;
  }
  const { email_hint } = await callUsernameAuth<{ sent: true; email_hint: string }>({ action: 'send_code', username: id.username });
  return email_hint;
}

export async function verifyLoginCode(id: Identifier, code: string): Promise<void> {
  if (id.kind === 'email') {
    const { error } = await supabase.auth.verifyOtp({ email: id.email, token: code, type: 'email' });
    if (error) throw error;
    return;
  }
  const { session } = await callUsernameAuth<{ session: { access_token: string; refresh_token: string } }>({
    action: 'verify_code',
    username: id.username,
    code,
  });
  await applySession(session);
}

/** Cria a senha de quem entrou com Google ou Apple (para poder entrar também com senha). */
export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
