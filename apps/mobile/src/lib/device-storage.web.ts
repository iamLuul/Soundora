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
