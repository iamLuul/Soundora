// Vídeos da timeline: quais posts estão na tela (para tocar sozinho) e o som (ligado ou não).
//
// - Som: um só para o app inteiro, começa desligado. Ligou num vídeo, os próximos também
//   tocam com som (como no Instagram); desligou, todos ficam mudos.
// - Na tela: a lista de posts avisa quais aparecem (pelo menos 60% do post visível). Fora de
//   uma lista (o post aberto), o vídeo conta como visível.
import { createContext, useCallback, useContext, useEffect, useId, useSyncExternalStore } from 'react';

type Listener = () => void;

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of listeners) l();
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const muted = store(true);

/** Som dos vídeos da timeline: [mudo?, trocar]. */
export function useFeedMuted(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(muted.subscribe, muted.get, muted.get);
  return [value, muted.set];
}

/** Volume (0 a 1) dos vídeos, um só para o app (a barra do computador). */
const volume = store(1);

export function useFeedVolume(): [number, (next: number) => void] {
  const value = useSyncExternalStore(volume.subscribe, volume.get, volume.get);
  return [value, volume.set];
}

/** Só para os testes. */
export function resetFeedMuted() {
  muted.set(true);
  volume.set(1);
}

/**
 * Um vídeo tocando por vez no app. Cada vídeo que quer tocar entra na fila; só o último que entrou
 * toca. Ex.: o vídeo da timeline tocando e a pessoa abre o post: o do post entra depois e o da
 * timeline pausa; ao voltar, o do post sai e o da timeline continua.
 */
const wantPlay = store<readonly string[]>([]);

export function claimPlayback(id: string) {
  const list = wantPlay.get();
  if (list[list.length - 1] !== id) wantPlay.set([...list.filter((x) => x !== id), id]);
}

export function releasePlayback(id: string) {
  const list = wantPlay.get();
  if (list.includes(id)) wantPlay.set(list.filter((x) => x !== id));
}

/** É a vez deste vídeo tocar? */
export function useIsPlaybackOwner(id: string): boolean {
  const get = () => {
    const list = wantPlay.get();
    return list[list.length - 1] === id;
  };
  return useSyncExternalStore(wantPlay.subscribe, get, get);
}

/**
 * Entra na fila enquanto `wants` (e sai ao parar ou sumir da tela). Devolve se é a vez dele.
 * `claim` põe este vídeo no fim da fila de novo (ex.: a pessoa apertou play nele).
 */
export function usePlaybackTurn(wants: boolean): { mine: boolean; claim: () => void } {
  const id = useId();
  useEffect(() => {
    if (wants) claimPlayback(id);
    else releasePlayback(id);
  }, [id, wants]);
  useEffect(() => () => releasePlayback(id), [id]);
  return { mine: useIsPlaybackOwner(id), claim: () => claimPlayback(id) };
}

/** Quais posts de uma lista estão na tela agora. */
export class VisiblePosts {
  private ids = new Set<string>();
  private listeners = new Set<Listener>();
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  has = (id: string) => this.ids.has(id);
  update(changes: { id: string; visible: boolean }[]) {
    let changed = false;
    for (const { id, visible } of changes) {
      if (visible === this.ids.has(id)) continue;
      if (visible) this.ids.add(id);
      else this.ids.delete(id);
      changed = true;
    }
    if (changed) for (const l of this.listeners) l();
  }
}

export const VisiblePostsContext = createContext<VisiblePosts | null>(null);

/** O post está na tela? (fora de uma lista: sempre) */
export function usePostVisible(postId: string | undefined): boolean {
  const visible = useContext(VisiblePostsContext);
  const subscribe = useCallback((l: Listener) => (visible ? visible.subscribe(l) : () => {}), [visible]);
  const get = () => (!visible || !postId ? true : visible.has(postId));
  return useSyncExternalStore(subscribe, get, get);
}

/**
 * A parte da tela onde a lista está aparece agora? Telas com abas internas que ficam todas
 * montadas (Início: Para você, Seguindo, Comunidades) marcam as escondidas com false: o vídeo
 * delas não toca, mesmo que o post esteja "na tela" da própria lista.
 */
export const FeedActiveContext = createContext(true);

export function useFeedActive(): boolean {
  return useContext(FeedActiveContext);
}

/** "0:07", "1:23": quanto falta (ou a duração). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
