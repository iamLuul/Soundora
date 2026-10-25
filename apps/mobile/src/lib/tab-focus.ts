import { useEffect, useRef } from 'react';

/**
 * Qual aba está aberta e quem quer saber quando a pessoa volta para o Início vindo de outra aba
 * (abrir um post e voltar não conta: a aba continua a mesma).
 */
let current: string | null = null;
const homeListeners = new Set<() => void>();

/** Chamado pelo navegador de abas a cada aba que ganha foco. */
export function onTabFocus(name: string): void {
  const prev = current;
  current = name;
  if (name === 'index' && prev !== null && prev !== 'index') homeListeners.forEach((l) => l());
}

/** Roda `cb` sempre que a pessoa volta para o Início vindo de outra aba. */
export function useHomeReturn(cb: () => void): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const l = () => ref.current();
    homeListeners.add(l);
    return () => {
      homeListeners.delete(l);
    };
  }, []);
}

/** Só para testes. */
export function resetTabFocusForTests(): void {
  current = null;
}
