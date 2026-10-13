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
  'cannot_remove_profile',
  'review_needs_album',
  'review_exists',
  'review_too_short',
  'review_too_long',
  'not_album',
  'favorite_needs_song',
  'not_song',
  'invalid_request',
]);

export class AppError extends Error {
  constructor(
    public readonly code: string,
    /** Motivo técnico (status HTTP, resposta do servidor). Mostrado só em desenvolvimento. */
    public readonly detail?: string,
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
    // Edge Function devolve { error: 'codigo' }
    const ctx = anyErr.context as { error?: unknown } | undefined;
    if (ctx && typeof ctx.error === 'string' && KNOWN.has(ctx.error)) return ctx.error;
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

const logged = new WeakSet<object>();

/** Mensagem traduzida + (em desenvolvimento) o motivo técnico na linha de baixo. */
export function formatError(t: (key: string, vars?: Record<string, unknown>) => string, err: unknown, vars?: Record<string, unknown>): string {
  // Em desenvolvimento, registra o motivo técnico uma vez (a tela pode renderizar várias vezes).
  if (__DEV__ && !(err !== null && typeof err === 'object' && logged.has(err))) {
    if (err !== null && typeof err === 'object') logged.add(err);
    console.warn('[Soundora]', err);
  }
  const detail = errorDetail(err);
  const message = t(errorMessageKey(err), vars);
  return detail ? `${message}\n${detail}` : message;
}
