// Peças comuns a todos os módulos da API: quem está logado e a chamada das Edge Functions.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AppError } from '../errors';
import { supabase } from '../supabase';

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('not_authenticated');
  return id;
}

/** Erro de uma Edge Function → AppError com o código que ela mandou ({ error: 'codigo' }). */
/**
 * Chama uma Edge Function. Se o servidor responder 401 (token de login vencido, por exemplo
 * depois de o app ficar em segundo plano), renova a sessão e tenta de novo uma vez.
 */
export async function invokeFunction<T = unknown>(name: string, options?: Parameters<typeof supabase.functions.invoke>[1]) {
  const first = await supabase.functions.invoke<T>(name, options);
  if (!(first.error instanceof FunctionsHttpError) || (first.error.context as Response).status !== 401) return first;
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return first;
  return supabase.functions.invoke<T>(name, options);
}

export async function functionError(name: string, error: Error, unavailableCode: string): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null);
    const code = typeof body?.error === 'string' ? body.error : 'generic';
    const retryAfter = typeof body?.retry_after === 'number' && body.retry_after > 0 ? Math.ceil(body.retry_after) : undefined;
    return new AppError(code, `${name} HTTP ${res.status}${body?.detail ? ` – ${body.detail}` : ''}`, retryAfter);
  }
  return new AppError(unavailableCode, `${error.name}: ${error.message}`);
}
