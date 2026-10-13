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
