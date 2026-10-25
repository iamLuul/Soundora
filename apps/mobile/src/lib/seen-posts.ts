import { deviceGet, deviceSet } from './device-storage';

/**
 * Posts do Para você que já apareceram na tela neste aparelho (os ~300 mais recentes, por 3
 * dias). Vão para o servidor ao abrir o feed, que os põe no fim: assim cada abertura mostra
 * primeiro o que a pessoa ainda não viu. Fica só no aparelho (não é histórico na conta).
 */
const KEY = 'soundhora.seen-posts';
const MAX = 300;
const TTL = 3 * 24 * 60 * 60 * 1000;

let seen: Map<string, number> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Map<string, number> {
  if (seen) return seen;
  seen = new Map();
  try {
    const raw = deviceGet(KEY);
    const list = raw ? (JSON.parse(raw) as [string, number][]) : [];
    const cutoff = Date.now() - TTL;
    for (const [id, at] of list) if (typeof id === 'string' && typeof at === 'number' && at > cutoff) seen.set(id, at);
  } catch {
    // guardado estragado: começa do zero
  }
  return seen;
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    deviceSet(KEY, JSON.stringify([...load()].slice(-MAX)));
  }, 2000);
}

/** Marca posts como vistos (apareceram na tela). */
export function markSeen(ids: string[]): void {
  if (!ids.length) return;
  const map = load();
  const now = Date.now();
  for (const id of ids) {
    map.delete(id); // reinserir: o Map fica na ordem do mais antigo para o mais novo
    map.set(id, now);
  }
  while (map.size > MAX) map.delete(map.keys().next().value!);
  save();
}

/** Os vistos ainda válidos, do mais recente para o mais antigo (o que vai para o servidor). */
export function seenSnapshot(): string[] {
  const cutoff = Date.now() - TTL;
  return [...load()]
    .filter(([, at]) => at > cutoff)
    .map(([id]) => id)
    .reverse()
    .slice(0, MAX);
}

/** Só para testes. */
export function resetSeenForTests(): void {
  seen = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}
