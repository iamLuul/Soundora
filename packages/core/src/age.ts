/**
 * Regras de idade do cadastro.
 *
 * A idade mínima ainda está em decisão, então tudo é configurável. Pelo ECA
 * Digital (Lei 15.211/2025), contas de menores de 16 anos em redes sociais
 * precisam estar vinculadas a um responsável. Enquanto esse vínculo não
 * existir no app (`guardianFlowEnabled: false`), essas contas são bloqueadas.
 * O banco aplica a mesma regra na função `complete_onboarding`.
 */

export interface AgePolicy {
  /** Idade mínima para usar o Soundora. */
  minAge: number;
  /** Abaixo desta idade, a conta precisa de um responsável vinculado. */
  guardianRequiredUnder: number;
  /** Se o fluxo de vínculo com responsável já existe no app. */
  guardianFlowEnabled: boolean;
}

export const DEFAULT_AGE_POLICY: AgePolicy = {
  minAge: 13,
  guardianRequiredUnder: 16,
  guardianFlowEnabled: false,
};

export type AgeGateResult =
  | { status: 'ok'; age: number; isMinor: boolean }
  | { status: 'needs_guardian'; age: number }
  | { status: 'too_young'; age: number }
  | { status: 'invalid' };

/** Idade completa em anos, na data `today` (padrão: hoje). Datas no formato AAAA-MM-DD. */
export function ageOn(birthdate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  return age;
}

export function checkAge(birthdate: string, policy: AgePolicy = DEFAULT_AGE_POLICY, today?: Date): AgeGateResult {
  const age = ageOn(birthdate, today);
  if (age === null || age > 120) return { status: 'invalid' };
  if (age < 0) return { status: 'invalid' };
  if (age < policy.minAge) return { status: 'too_young', age };
  if (age < policy.guardianRequiredUnder) {
    return policy.guardianFlowEnabled ? { status: 'ok', age, isMinor: true } : { status: 'needs_guardian', age };
  }
  return { status: 'ok', age, isMinor: age < 18 };
}
