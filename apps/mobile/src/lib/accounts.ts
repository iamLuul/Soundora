// Contas salvas neste aparelho, para trocar de conta sem sair e entrar de novo.
//
// Segurança:
// - Só fica guardado o refresh token de cada conta (o "login" dela), no MESMO cofre da sessão:
//   criptografado com a chave no Keychain/Keystore no celular (session-storage.ts). Nada vai
//   para o servidor além do que o login já manda.
// - A conta aberta agora NÃO guarda token aqui (a sessão viva fica só no Supabase). O token dela
//   só é gravado na hora de sair dela (trocar ou adicionar outra), já o mais recente. Assim não
//   sobra token velho no cofre (reusar um token velho faz o Supabase derrubar a sessão).
// - Ao trocar, o token salvo é gasto e trocado por um novo; se ele não vale mais (conta saiu em
//   outro lugar, senha trocada), a conta sai da lista e a conta atual continua aberta.
import type { Session } from '@supabase/supabase-js';
import { createSessionStorage } from './session-storage';

/** Quantas contas cabem na lista do aparelho. */
export const MAX_ACCOUNTS = 5;

const KEY = 'soundora-accounts';

/** O que a lista mostra (sem token). */
export interface AccountInfo {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface StoredAccount extends AccountInfo {
  /** null na conta aberta agora (o token vivo fica na sessão do Supabase). */
  refreshToken: string | null;
}

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let storage: Storage = createSessionStorage();
/** Só para os testes. */
export function setAccountsStorage(s: Storage) {
  storage = s;
}

function isStored(x: unknown): x is StoredAccount {
  const a = x as StoredAccount;
  return (
    !!a &&
    typeof a.userId === 'string' &&
    typeof a.username === 'string' &&
    typeof a.displayName === 'string' &&
    (a.avatarUrl === null || typeof a.avatarUrl === 'string') &&
    (a.refreshToken === null || typeof a.refreshToken === 'string')
  );
}

async function read(): Promise<StoredAccount[]> {
  try {
    const raw = await storage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isStored).slice(0, MAX_ACCOUNTS) : [];
  } catch {
    return [];
  }
}

async function write(list: StoredAccount[]) {
  if (list.length === 0) await storage.removeItem(KEY);
  else await storage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
}

const info = ({ userId, username, displayName, avatarUrl }: StoredAccount): AccountInfo => ({ userId, username, displayName, avatarUrl });

/** As contas do aparelho (a aberta e as outras), na ordem em que foram usadas. */
export async function listAccounts(): Promise<AccountInfo[]> {
  return (await read()).map(info);
}

/** Pode entrar em mais uma conta? (a aberta já conta) */
export async function canAddAccount(currentUserId: string | null): Promise<boolean> {
  const list = await read();
  const others = list.filter((a) => a.userId !== currentUserId).length;
  return others + (currentUserId ? 1 : 0) < MAX_ACCOUNTS;
}

/** A conta aberta entra (ou é atualizada) na lista, sem token. */
export async function rememberCurrent(account: AccountInfo): Promise<void> {
  const list = await read();
  const rest = list.filter((a) => a.userId !== account.userId);
  await write([{ ...account, refreshToken: null }, ...rest]);
}

/** Saindo da conta aberta (para trocar ou adicionar outra): guarda o token mais recente dela. */
export async function parkCurrent(account: AccountInfo, session: Session): Promise<void> {
  const list = await read();
  const rest = list.filter((a) => a.userId !== account.userId);
  await write([{ ...account, refreshToken: session.refresh_token }, ...rest]);
}

/** O token guardado de uma conta (para entrar nela). null se não houver. */
export async function tokenOf(userId: string): Promise<string | null> {
  return (await read()).find((a) => a.userId === userId)?.refreshToken ?? null;
}

/** Tira a conta da lista deste aparelho (e o token dela). */
export async function forgetAccount(userId: string): Promise<void> {
  await write((await read()).filter((a) => a.userId !== userId));
}

/** Próxima conta com token para entrar (ao sair de uma conta, abre a seguinte). */
export async function nextParked(exceptUserId: string | null): Promise<AccountInfo | null> {
  const found = (await read()).find((a) => a.userId !== exceptUserId && a.refreshToken);
  return found ? info(found) : null;
}
