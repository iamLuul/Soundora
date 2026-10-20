import { useQuery } from '@tanstack/react-query';
import { fetchAuthorsWithVibes } from './api';

/**
 * O autor tem vibe ativa que eu posso ver? (o anel roxo em volta da foto nos posts).
 *
 * Cada post pergunta pelo seu autor, mas os pedidos feitos juntos (a mesma página do feed)
 * viram uma consulta só ao banco (authors_with_vibes, até 200 autores por vez). A resposta fica
 * guardada por 1 minuto, e criar ou apagar uma vibe atualiza (a chave começa com 'vibes').
 */
export const vibeRingKey = (authorId: string) => ['vibes', 'active', authorId] as const;

type Waiter = { resolve: (has: boolean) => void; reject: (err: unknown) => void };
let pending: Map<string, Waiter[]> | null = null;

async function flush(batch: Map<string, Waiter[]>) {
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    try {
      const active = await fetchAuthorsWithVibes(chunk);
      for (const id of chunk) for (const w of batch.get(id)!) w.resolve(active.has(id));
    } catch (err) {
      for (const id of chunk) for (const w of batch.get(id)!) w.reject(err);
    }
  }
}

/** Junta os pedidos feitos no mesmo instante numa consulta só. */
export function hasActiveVibes(authorId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!pending) {
      const batch = new Map<string, Waiter[]>();
      pending = batch;
      setTimeout(() => {
        pending = null;
        void flush(batch);
      }, 0);
    }
    const list = pending.get(authorId) ?? [];
    list.push({ resolve, reject });
    pending.set(authorId, list);
  });
}

/** true só quando o banco confirmou que há vibe ativa (carregando ou com erro: sem anel). */
export function useHasActiveVibes(authorId: string): boolean {
  const q = useQuery({ queryKey: vibeRingKey(authorId), queryFn: () => hasActiveVibes(authorId), staleTime: 60_000 });
  return q.data === true;
}
