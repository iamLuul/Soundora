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
]);

export class AppError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AppError';
  }
}

export function errorCode(err: unknown): string {
  if (err instanceof AppError) return err.code;
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; code?: unknown; context?: unknown };
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
