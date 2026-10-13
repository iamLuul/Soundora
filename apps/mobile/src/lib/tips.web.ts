// Dicas de primeira vez na Web: localStorage do navegador. Não importe o expo-sqlite aqui:
// a versão Web dele precisa de WebAssembly e quebra o servidor de desenvolvimento.
export type TipKey = 'discover' | 'vibe-new' | 'vibe-view';
const key = (tip: TipKey) => `soundora.tip.${tip}`;

export function tipSeen(tip: TipKey): boolean {
  try {
    // Na renderização estática (Node) não existe localStorage: sem dica.
    return typeof localStorage === 'undefined' || localStorage.getItem(key(tip)) === '1';
  } catch {
    return true;
  }
}

export function markTipSeen(tip: TipKey) {
  try {
    localStorage.setItem(key(tip), '1');
  } catch {
    // ignora: a dica só pode voltar a aparecer
  }
}
