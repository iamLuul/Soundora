import { isNetworkError } from './server-url';

/** Converte erros do Supabase Auth em chaves de tradução. */
export function authErrorKey(err: unknown): string {
  if (isNetworkError(err)) return 'auth.networkError';
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  const message = err && typeof err === 'object' ? String((err as { message?: unknown }).message ?? '') : '';
  switch (code) {
    case 'invalid_credentials':
      return 'auth.wrongPassword';
    case 'user_already_exists':
    case 'email_exists':
      return 'auth.emailExists';
    case 'weak_password':
      return 'errors.password_too_short';
    case 'email_not_confirmed':
      return 'auth.confirmEmail';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'auth.rateLimit';
    case 'otp_expired':
      return 'auth.invalidCode';
  }
  // Versões antigas do servidor não mandam `code`: cai para a mensagem.
  if (/invalid login credentials/i.test(message)) return 'auth.wrongPassword';
  if (/already registered/i.test(message)) return 'auth.emailExists';
  if (/rate limit/i.test(message)) return 'auth.rateLimit';
  return 'common.error';
}
