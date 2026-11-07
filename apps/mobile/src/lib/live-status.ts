// Se o canal ao vivo (Supabase Realtime) está conectado agora. Com ele conectado, o sino e as
// mensagens se atualizam pelos avisos e não precisam perguntar ao servidor de tempos em tempos;
// sem ele (ainda conectando, caiu, sem internet), voltam a perguntar sozinhos.
import { useSyncExternalStore } from 'react';

let connected = false;
const listeners = new Set<() => void>();

export function setLiveConnected(next: boolean) {
  if (next === connected) return;
  connected = next;
  for (const l of listeners) l();
}

export function isLiveConnected() {
  return connected;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useLiveConnected(): boolean {
  return useSyncExternalStore(subscribe, isLiveConnected, () => false);
}

