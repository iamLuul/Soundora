// Edge Function: auth-username
//
// Entrar com @usuário (senha ou código por e-mail). Recebe
//   { action: 'password', username, password }
//   { action: 'send_code', username }
//   { action: 'verify_code', username, code }
// e devolve { session } (o app chama supabase.auth.setSession) ou { sent, email_hint }.
// Não exige login (verify_jwt = false em supabase/config.toml): é a própria tela de entrar.
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy auth-username --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, type AuthResult, type Session } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(supabaseUrl, apiKey('secret'), noSession);
/**
 * Um cliente novo por login, para a sessão de uma pessoa nunca ficar guardada na função.
 * Repassa o IP de quem pediu: sem isso, o Supabase Auth veria sempre o IP da função, e o
 * limite por IP dele valeria para todo mundo junto. (Confirme na nuvem: docs/SEGURANCA.md.)
 */
const publicClient = (ip: string | null) =>
  createClient(supabaseUrl, apiKey('publishable'), { ...noSession, global: { headers: ip ? { 'X-Forwarded-For': ip } : {} } });

function sessionResult(data: { session: { access_token: string; refresh_token: string } | null }, error: unknown): AuthResult<Session> {
  if (error) return { data: null, error: error as AuthResult<Session>['error'] & object };
  if (!data.session) return { data: null, error: { code: 'no_session', message: 'Auth não devolveu sessão' } };
  return { data: { access_token: data.session.access_token, refresh_token: data.session.refresh_token }, error: null };
}

Deno.serve(
  createHandler({
    debug: isDebug,
    async lookup(username) {
      const { data, error } = await admin.rpc('login_lookup', { p_username: username });
      if (error) throw error;
      const row = (data as { user_id: string; email: string | null }[] | null)?.[0];
      return row?.email ? { userId: row.user_id, email: row.email } : null;
    },
    async startAttempt(username, action, ip) {
      const { data, error } = await admin.rpc('login_attempt_start', { p_username: username, p_kind: action, p_ip: ip });
      if (error) throw error;
      return (data as number | null) ?? null;
    },
    async finishAttempt(id, success) {
      const { error } = await admin.rpc('login_attempt_finish', { p_id: id, p_success: success });
      if (error) throw error;
    },
    async signInWithPassword(email, password, ip) {
      const { data, error } = await publicClient(ip).auth.signInWithPassword({ email, password });
      return sessionResult(data, error);
    },
    async sendCode(email, ip) {
      const { error } = await publicClient(ip).auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return error ? { data: null, error } : { data: true, error: null };
    },
    async verifyCode(email, code, ip) {
      const { data, error } = await publicClient(ip).auth.verifyOtp({ email, token: code, type: 'email' });
      return sessionResult(data, error);
    },
  }),
);
