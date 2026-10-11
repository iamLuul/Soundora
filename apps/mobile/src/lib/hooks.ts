import { useEffect, useState } from 'react';

/** Atraso para não buscar a cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Tira itens repetidos de uma lista (mantém o primeiro). Em desenvolvimento, avisa no console
 * qual lista veio com repetido, para achar a origem.
 */
export function uniqueBy<T>(items: readonly T[], id: (item: T) => string, list = 'lista'): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = id(item);
    if (seen.has(key)) {
      if (__DEV__) console.warn(`[Soundora] item repetido em ${list}: ${key}`);
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}
