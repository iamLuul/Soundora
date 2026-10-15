import { usernameSchema } from '@soundhora/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checkUsernameAvailable } from './api';
import { errorMessageKey } from './errors';
import { useDebouncedValue } from './hooks';

export type UsernameStatus =
  | { state: 'empty' }
  | { state: 'invalid'; reason: string }
  | { state: 'checking' }
  | { state: 'available'; username: string }
  | { state: 'taken'; username: string }
  | { state: 'error'; message: string };

/** Valida o formato no app (instantâneo). Devolve o username normalizado ou o motivo do erro. */
export function validateUsernameFormat(raw: string): { ok: true; username: string } | { ok: false; reason: string } {
  const parsed = usernameSchema.safeParse(raw);
  if (parsed.success) return { ok: true, username: parsed.data };
  return { ok: false, reason: parsed.error.issues[0]?.message ?? 'generic' };
}

/**
 * Status do username enquanto a pessoa digita: formato no app e disponibilidade
 * no banco (com 400 ms de espera para não consultar a cada tecla).
 */
export function useUsernameStatus(raw: string): UsernameStatus {
  const { t } = useTranslation();
  const trimmed = raw.trim();
  const format = validateUsernameFormat(trimmed);
  const debounced = useDebouncedValue(format.ok ? format.username : '', 400);
  const query = useQuery({
    queryKey: ['username-available', debounced],
    queryFn: () => checkUsernameAvailable(debounced),
    enabled: debounced.length > 0,
    staleTime: 10_000,
  });

  if (!trimmed) return { state: 'empty' };
  if (!format.ok) return { state: 'invalid', reason: format.reason };
  if (debounced !== format.username || query.isLoading) return { state: 'checking' };
  if (query.isError) {
    // Sem isso, a checagem falhava calada e só sobrava a dica do formato.
    const key = errorMessageKey(query.error);
    return { state: 'error', message: t(key === 'errors.generic' ? 'onboarding.usernameCheckFailed' : key) };
  }
  return query.data ? { state: 'available', username: format.username } : { state: 'taken', username: format.username };
}

const DAY = 86_400_000;

/** Data a partir da qual a pessoa pode trocar o @ de novo (null = já pode). Mesma regra de change_username no banco. */
export function nextUsernameChange(changedAt: string | null, now = Date.now(), days = 30): Date | null {
  if (!changedAt) return null;
  const next = new Date(new Date(changedAt).getTime() + days * DAY);
  return next.getTime() > now ? next : null;
}
