// Cookies e dados guardados neste aparelho (LGPD): o que o Soundhora guarda, para quê, e a
// escolha da pessoa sobre o que é opcional.
//
// Na web o Soundhora não usa cookies HTTP: tudo fica no armazenamento local do navegador
// (localStorage). No celular, no armazenamento do app. A regra é a mesma nos dois:
// - Necessários: sem eles o app não funciona (login, segurança, a própria escolha). Não pedem
//   consentimento (LGPD art. 7º, V: execução do serviço que a pessoa pediu).
// - Preferências e Personalização: opcionais. Só são gravados com o "sim" da pessoa
//   (art. 7º, I e art. 8º), que pode mudar de ideia a qualquer momento. Sem o "sim", o recurso
//   funciona só enquanto o app está aberto (fica na memória) e nada é gravado.
// - Privacidade por padrão (art. 46): até a pessoa escolher, vale "só os necessários".
import { useSyncExternalStore } from 'react';
import { deviceGet, deviceKeys, deviceRemove, deviceSet } from './device-storage';

export type OptionalCategory = 'preferences' | 'personalization';
export type StorageCategory = 'necessary' | OptionalCategory;
export const OPTIONAL_CATEGORIES: OptionalCategory[] = ['preferences', 'personalization'];

/** Sobe quando o que guardamos muda de um jeito que pede uma nova escolha (o aviso volta). */
export const CONSENT_VERSION = 1;

export interface ConsentChoice {
  preferences: boolean;
  personalization: boolean;
  /** Quando a pessoa escolheu (ISO). */
  at: string;
  version: number;
  /** Contas em que esta escolha já foi registrada no servidor (prova do consentimento). */
  synced?: string[];
}

/** Um item guardado: chave exata ou prefixo, a categoria e o texto da tela (i18n). */
export interface StoredItem {
  id: string;
  category: StorageCategory;
  match: (key: string) => boolean;
}

const KEY = 'soundhora.consent';

/** Tudo o que o app guarda no aparelho. Item novo guardado pelo app tem que entrar aqui. */
export const STORED_ITEMS: StoredItem[] = [
  // Necessários
  { id: 'session', category: 'necessary', match: (k) => k.startsWith('sb-') && k.includes('-auth-token') },
  { id: 'accounts', category: 'necessary', match: (k) => k === 'soundora-accounts' },
  { id: 'push', category: 'necessary', match: (k) => k === 'soundora.push-token' },
  { id: 'consent', category: 'necessary', match: (k) => k === KEY },
  // Preferências
  { id: 'display', category: 'preferences', match: (k) => k === 'soundora.display' },
  { id: 'tips', category: 'preferences', match: (k) => k.startsWith('soundora.tip.') },
  // Personalização
  { id: 'seenPosts', category: 'personalization', match: (k) => k === 'soundhora.seen-posts' },
];

// ---------------------------------------------------------------- escolha guardada

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: ConsentChoice | null | undefined;

function parse(raw: string | null): ConsentChoice | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<ConsentChoice> | null;
    if (!v || typeof v !== 'object' || typeof v.at !== 'string' || typeof v.version !== 'number') return null;
    return {
      preferences: v.preferences === true,
      personalization: v.personalization === true,
      at: v.at,
      version: v.version,
      synced: Array.isArray(v.synced) ? v.synced.filter((x): x is string => typeof x === 'string').slice(-10) : [],
    };
  } catch {
    return null;
  }
}

/** A escolha atual (null = ainda não escolheu nesta versão). */
export function getConsent(): ConsentChoice | null {
  if (cached === undefined) cached = parse(deviceGet(KEY));
  return cached && cached.version >= CONSENT_VERSION ? cached : null;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** A escolha atual, atualizando a tela quando muda. */
export function useConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribe, getConsent, getConsent);
}

/** Pode gravar esta categoria? Necessários sempre; opcionais só com o "sim". */
export function allows(category: StorageCategory): boolean {
  if (category === 'necessary') return true;
  return getConsent()?.[category] === true;
}

/**
 * Grava a escolha. O que foi desligado é apagado na hora do aparelho; o que foi ligado passa a
 * ser gravado (inclusive o que estava só na memória nesta abertura).
 */
export function saveConsent(choice: { preferences: boolean; personalization: boolean }): ConsentChoice {
  const previous = getConsent();
  const next: ConsentChoice = {
    preferences: choice.preferences,
    personalization: choice.personalization,
    at: new Date().toISOString(),
    version: CONSENT_VERSION,
    // Mudou a escolha: precisa registrar de novo no servidor.
    synced: previous && previous.preferences === choice.preferences && previous.personalization === choice.personalization ? previous.synced : [],
  };
  cached = next;
  deviceSet(KEY, JSON.stringify(next));
  for (const category of OPTIONAL_CATEGORIES) {
    if (next[category]) flushMemory(category);
    else clearCategory(category);
  }
  emit();
  return next;
}

/** Marca que a escolha atual já foi registrada no servidor para esta conta. */
export function markConsentSynced(userId: string) {
  const current = getConsent();
  if (!current || current.synced?.includes(userId)) return;
  const next = { ...current, synced: [...(current.synced ?? []), userId].slice(-10) };
  cached = next;
  deviceSet(KEY, JSON.stringify(next));
}

// ---------------------------------------------------------------- gravar respeitando a escolha

// Sem o "sim": o valor fica só na memória até fechar o app (o recurso funciona, nada é gravado).
const memory = new Map<string, { category: OptionalCategory; value: string }>();

export function storedGet(category: StorageCategory, key: string): string | null {
  if (allows(category)) return deviceGet(key);
  return memory.get(key)?.value ?? null;
}

export function storedSet(category: StorageCategory, key: string, value: string) {
  if (allows(category)) deviceSet(key, value);
  else if (category !== 'necessary') memory.set(key, { category, value });
}

function flushMemory(category: OptionalCategory) {
  for (const [key, item] of memory) {
    if (item.category !== category) continue;
    deviceSet(key, item.value);
    memory.delete(key);
  }
}

// ---------------------------------------------------------------- ver e apagar

export function categoryOf(key: string): StorageCategory | null {
  return STORED_ITEMS.find((i) => i.match(key))?.category ?? null;
}

/** O que está guardado agora, por item da lista (com o tamanho aproximado em bytes). */
export function storedSummary(): { item: StoredItem; keys: string[]; bytes: number }[] {
  const keys = deviceKeys();
  return STORED_ITEMS.map((item) => {
    const mine = keys.filter((k) => item.match(k));
    const bytes = mine.reduce((sum, k) => sum + k.length + (deviceGet(k)?.length ?? 0), 0);
    return { item, keys: mine, bytes };
  });
}

/** Apaga do aparelho tudo de uma categoria opcional (e o que estava na memória). */
export function clearCategory(category: OptionalCategory) {
  for (const key of deviceKeys()) if (categoryOf(key) === category) deviceRemove(key);
  for (const [key, item] of memory) if (item.category === category) memory.delete(key);
}

/** Só para os testes. */
export function resetConsentForTests() {
  cached = undefined;
  memory.clear();
  emit();
}
