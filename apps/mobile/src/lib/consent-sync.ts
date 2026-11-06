// Registro da escolha de cookies no servidor (prova do consentimento, LGPD art. 8º, §2º).
// Separado de lib/consent para o resto do app não depender da API.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { recordCookieConsent } from './api';
import { getConsent, markConsentSynced, saveConsent, useConsent, type ConsentChoice } from './consent';

const platform = (Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web') as 'web' | 'android' | 'ios';

/** Registra a escolha atual para esta conta (uma vez por escolha). Falha não atrapalha nada. */
// Registro já a caminho (a mesma escolha não vai duas vezes para o servidor).
const pending = new Set<string>();

export async function syncConsent(userId: string | null | undefined, choice: ConsentChoice | null = getConsent()): Promise<void> {
  if (!userId || !choice || choice.synced?.includes(userId)) return;
  const id = `${userId}:${choice.at}`;
  if (pending.has(id)) return;
  pending.add(id);
  try {
    await recordCookieConsent(choice, platform);
    markConsentSynced(userId);
  } catch {
    // Sem conexão ou limite: tenta de novo na próxima abertura.
  } finally {
    pending.delete(id);
  }
}

/** Grava a escolha no aparelho e, com login, registra no servidor. */
export function chooseConsent(choice: { preferences: boolean; personalization: boolean }, userId: string | null | undefined) {
  const saved = saveConsent(choice);
  void syncConsent(userId, saved);
  return saved;
}

/** Entrou numa conta (ou abriu o app logado): registra a escolha feita antes, se ainda não foi. */
export function useConsentSync(userId: string | null | undefined) {
  const consent = useConsent();
  useEffect(() => {
    void syncConsent(userId, consent);
  }, [userId, consent]);
}
