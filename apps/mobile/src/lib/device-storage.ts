// Guardar preferências deste aparelho (síncrono). No celular: o localStorage do expo-sqlite.
import 'expo-sqlite/localStorage/install';

export function deviceGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function deviceSet(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // sem armazenamento: a preferência vale só até fechar o app
  }
}

export function deviceRemove(key: string) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // nada a apagar
  }
}

/** Chaves guardadas neste aparelho (para a tela de cookies listar e apagar). */
export function deviceKeys(): string[] {
  try {
    const s = globalThis.localStorage;
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
