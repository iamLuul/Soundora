// Dicas de primeira vez (Descobrir, criar vibe, ver vibes): aparecem uma vez por aparelho.
import 'expo-sqlite/localStorage/install';

export type TipKey = 'discover' | 'vibe-new' | 'vibe-view';
const key = (tip: TipKey) => `soundora.tip.${tip}`;

export function tipSeen(tip: TipKey): boolean {
  try {
    return globalThis.localStorage?.getItem(key(tip)) === '1';
  } catch {
    // Sem armazenamento (navegador privado, erro do aparelho): não insiste na dica.
    return true;
  }
}

export function markTipSeen(tip: TipKey) {
  try {
    globalThis.localStorage?.setItem(key(tip), '1');
  } catch {
    // ignora: a dica só pode voltar a aparecer
  }
}
