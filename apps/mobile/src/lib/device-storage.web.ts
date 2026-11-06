// Na Web: o localStorage do navegador. Não importe o expo-sqlite aqui (a versão Web dele precisa
// de WebAssembly e quebra o servidor de desenvolvimento).
export function deviceGet(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function deviceSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // navegador privado ou armazenamento bloqueado
  }
}

export function deviceRemove(key: string) {
  try {
    (typeof localStorage === 'undefined' ? undefined : localStorage)?.removeItem(key);
  } catch {
    // nada a apagar
  }
}

/** Chaves guardadas neste aparelho (para a tela de cookies listar e apagar). */
export function deviceKeys(): string[] {
  try {
    const s = typeof localStorage === 'undefined' ? undefined : localStorage;
    if (!s) return [];
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}
