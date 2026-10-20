/**
 * Converte erros do Supabase (banco, Edge Function, validação) em uma chave
 * de tradução de `errors.*`.
 */
const KNOWN = new Set([
  'username_taken',
  'username_too_short',
  'username_too_long',
  'username_invalid_chars',
  'username_invalid_dots',
  'display_name_required',
  'genres_too_few',
  'unsupported',
  'not_found',
  'fetch_failed',
  'blocked_host',
  'post_text_too_long',
  'comment_too_long',
  'too_young',
  'needs_guardian',
  'birthdate_invalid',
  'preview_unavailable',
  'not_authenticated',
  'password_too_short',
  'password_too_long',
  'bio_too_long',
  'passwords_differ',
  'password_needs_letters_digits',
  'rate_limited',
  'payload_too_large',
  'unsupported_image',
  'invalid_image',
  'image_dimensions',
  'username_change_too_soon',
  'confirmation_mismatch',
  'reauth_required',
  'server_outdated',
  'push_unavailable',
  'invalid_media',
  'genres_need_music',
  'invalid_parent',
  'unsupported_video',
  'invalid_video',
  'video_too_long',
  'video_too_large',
  'video_dimensions',
  'post_empty',
  'invalid_genre',
  'account_suspended',
  'forbidden',
  'cannot_suspend_admin',
  'badge_unavailable',
  'badge_retired',
  'badge_not_manual',
  'user_not_found',
  'cannot_remove_profile',
  'review_needs_album',
  'review_exists',
  'review_too_short',
  'review_too_long',
  'not_album',
  'favorite_needs_song',
  'not_song',
  'invalid_request',
  'network',
  'gone',
  'duplicate',
  'request_not_found',
  // Erros do login (Supabase Auth devolvem o código em `code`).
  'identity_not_found',
  'single_identity_not_deletable',
  'manual_linking_disabled',
]);

export class AppError extends Error {
  constructor(
    public readonly code: string,
    /** Motivo técnico (status HTTP, resposta do servidor). Mostrado só em desenvolvimento. */
    public readonly detail?: string,
    /** Limite de ações: em quantos segundos dá para tentar de novo. */
    public readonly retryAfter?: number,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AppError';
  }
}

/** Texto técnico do erro para exibir em desenvolvimento (vazio em produção). */
export function errorDetail(err: unknown): string {
  if (!__DEV__ || !err) return '';
  if (err instanceof AppError) return err.detail ?? '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    return [e.code, e.message].filter(Boolean).join(' ');
  }
  return String(err);
}

export function errorCode(err: unknown): string {
  if (err instanceof AppError) return KNOWN.has(err.code) ? err.code : 'generic';
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; code?: unknown; context?: unknown };
    // PGRST202/PGRST205: a função ou tabela não existe no servidor = banco sem as migrations.
    if (anyErr.code === 'PGRST202' || anyErr.code === 'PGRST205') return 'server_outdated';
    // Funções do banco usam "raise exception 'codigo'"
    if (typeof anyErr.message === 'string' && KNOWN.has(anyErr.message)) return anyErr.message;
    // Supabase Auth: código em `code` (ex.: single_identity_not_deletable).
    if (typeof anyErr.code === 'string' && KNOWN.has(anyErr.code)) return anyErr.code;
    // Edge Function devolve { error: 'codigo' }
    const ctx = anyErr.context as { error?: unknown } | undefined;
    if (ctx && typeof ctx.error === 'string' && KNOWN.has(ctx.error)) return ctx.error;
    // Sem internet / servidor fora do ar (fetch não chegou a responder).
    const message = typeof anyErr.message === 'string' ? anyErr.message : '';
    if (/Network request failed|Failed to fetch|NetworkError|Load failed|network error/i.test(message)) return 'network';
    // Sessão vencida.
    if (anyErr.code === 'PGRST301' || anyErr.code === 'PGRST303' || /JWT expired/i.test(message)) return 'not_authenticated';
    // Erros do Postgres que a pessoa pode entender:
    switch (anyErr.code) {
      case '23505': // já existe (curtiu duas vezes, review repetida…)
        return 'duplicate';
      case '23503': // o conteúdo foi apagado enquanto a tela estava aberta
        return 'gone';
      case '42501': // RLS: bloqueio, conteúdo de outra pessoa
        return 'forbidden';
      case '23514': // regra do banco (tamanho, valor fora do limite)
      case '22001':
        return 'invalid_request';
    }
  }
  return 'generic';
}

/** Chave i18n para mostrar ao usuário. */
export function errorMessageKey(err: unknown): string {
  const code = errorCode(err);
  if (code === 'blocked_host') return 'errors.unsupported';
  if (code === 'too_young' || code === 'needs_guardian') return `age.${code}`;
  if (code === 'birthdate_invalid') return 'age.invalid';
  return `errors.${code}`;
}

/** Em quantos segundos dá para tentar de novo depois de um limite (null = não informado). */
export function retryAfterSeconds(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  if (err instanceof AppError) return err.retryAfter ?? null;
  const e = err as { details?: unknown; context?: unknown };
  // Banco: raise 'rate_limited' com DETAIL = segundos (chega como "details").
  if (typeof e.details === 'string' && /^\d{1,7}$/.test(e.details)) return Number(e.details);
  // Edge Function: { error: 'rate_limited', retry_after: segundos }.
  const ctx = e.context as { retry_after?: unknown } | undefined;
  if (ctx && typeof ctx.retry_after === 'number' && ctx.retry_after > 0) return Math.ceil(ctx.retry_after);
  return null;
}

/** "Tente de novo em X minutos/horas" quando o limite informa o tempo. */
function rateLimitMessage(t: (key: string, vars?: Record<string, unknown>) => string, seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes <= 90) return t('errors.rate_limited_minutes', { count: minutes });
  return t('errors.rate_limited_hours', { count: Math.ceil(minutes / 60) });
}

const logged = new WeakSet<object>();

/** Mensagem traduzida + (em desenvolvimento) o motivo técnico na linha de baixo. */
export function formatError(t: (key: string, vars?: Record<string, unknown>) => string, err: unknown, vars?: Record<string, unknown>): string {
  // Em desenvolvimento, registra o motivo técnico uma vez (a tela pode renderizar várias vezes).
  if (__DEV__ && !(err !== null && typeof err === 'object' && logged.has(err))) {
    if (err !== null && typeof err === 'object') logged.add(err);
    console.warn('[Soundhora]', err);
  }
  // Em desenvolvimento, o banco sem migrations ganha a instrução de como resolver.
  const detail = [errorCode(err) === 'server_outdated' && __DEV__ ? 'Banco sem as migrations: rode "npx supabase migration up" (local) ou "npx supabase db push" (nuvem).' : '', errorDetail(err)]
    .filter(Boolean)
    .join('\n');
  const wait = errorCode(err) === 'rate_limited' ? retryAfterSeconds(err) : null;
  const message = wait ? rateLimitMessage(t, wait) : t(errorMessageKey(err), vars);
  return detail ? `${message}\n${detail}` : message;
}
