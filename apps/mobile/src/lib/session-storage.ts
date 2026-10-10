// Onde a sessão do Supabase (tokens de login) fica guardada no Android e no iOS.
//
// A sessão é criptografada com AES-256 antes de ir para o disco. A chave de cada item
// fica no cofre do sistema (Keychain no iOS, Keystore no Android) via expo-secure-store;
// no SQLite (expo-sqlite) fica só o texto cifrado. O cofre do sistema tem limite de ~2 KB
// por item e a sessão passa disso, por isso o par cofre + SQLite.
// Na Web, veja session-storage.web.ts.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import 'expo-sqlite/localStorage/install';
import aesjs from 'aes-js';

/** O cofre só aceita letras, números, ".", "-" e "_" no nome. */
const vaultKey = (key: string) => `soundora.${key.replace(/[^\w.-]/g, '_')}`;
const VAULT = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export class EncryptedSessionStorage {
  async getItem(key: string): Promise<string | null> {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const keyHex = await SecureStore.getItemAsync(vaultKey(key), VAULT);
    const [ivHex, dataHex] = stored.split(':');
    if (!keyHex || !ivHex || !dataHex) {
      // Sem a chave (app reinstalado, cofre limpo) não dá para ler: descarta e pede login de novo.
      localStorage.removeItem(key);
      return null;
    }
    const ctr = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(aesjs.utils.hex.toBytes(ivHex)));
    return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(dataHex)));
  }

  async setItem(key: string, value: string): Promise<void> {
    // Chave e contador novos a cada gravação.
    const encryptionKey = Crypto.getRandomBytes(32);
    const iv = Crypto.getRandomBytes(16);
    const ctr = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv));
    const data = ctr.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(vaultKey(key), aesjs.utils.hex.fromBytes(encryptionKey), VAULT);
    localStorage.setItem(key, `${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(data)}`);
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
    await SecureStore.deleteItemAsync(vaultKey(key), VAULT);
  }
}

export function createSessionStorage() {
  return new EncryptedSessionStorage();
}
