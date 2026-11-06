// Dicas de primeira vez (Descobrir, criar vibe, ver vibes): aparecem uma vez por aparelho.
// "Já vi" é uma preferência (lib/consent): sem o "sim" da pessoa, vale só enquanto o app está aberto.
import { storedGet, storedSet } from './consent';

export type TipKey = 'discover' | 'vibe-new' | 'vibe-view' | 'ads-intro';
const key = (tip: TipKey) => `soundora.tip.${tip}`;

export function tipSeen(tip: TipKey): boolean {
  // Na renderização estática da web (Node) não existe armazenamento: sem dica.
  if (typeof window === 'undefined' && typeof globalThis.localStorage === 'undefined') return true;
  return storedGet('preferences', key(tip)) === '1';
}

export function markTipSeen(tip: TipKey) {
  storedSet('preferences', key(tip), '1');
}
