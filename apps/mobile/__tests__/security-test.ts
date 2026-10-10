import { avatarUrl } from '../src/lib/avatar';
import { isSecretKey } from '../src/lib/key-guard';

jest.mock('../src/lib/supabase', () => ({ supabaseUrl: 'http://192.168.0.10:54321' }));

// Cofre do sistema e SQLite falsos, para testar a criptografia da sessão.
const mockVault = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockVault.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockVault.set(k, v),
  deleteItemAsync: async (k: string) => void mockVault.delete(k),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256)),
}));
jest.mock('expo-sqlite/localStorage/install', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return {};
});

// eslint-disable-next-line import/first
import { EncryptedSessionStorage } from '../src/lib/session-storage';

/** JWT falso (sem assinatura válida), só para o teste de papel. */
function jwt(payload: object) {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.assinatura`;
}

describe('chave do Supabase no app', () => {
  test('recusa a chave secreta, nova ou legada', () => {
    expect(isSecretKey('sb_secret_abc123')).toBe(true);
    expect(isSecretKey(jwt({ role: 'service_role', iss: 'supabase' }))).toBe(true);
  });
  test('aceita a publishable key e a anon key legada', () => {
    expect(isSecretKey('sb_publishable_abc123')).toBe(false);
    expect(isSecretKey(jwt({ role: 'anon', iss: 'supabase' }))).toBe(false);
    expect(isSecretKey('qualquer-coisa')).toBe(false);
  });
});

describe('avatarUrl', () => {
  test('monta a URL pública a partir do caminho guardado no perfil', () => {
    expect(avatarUrl('avatars/0b4c1d2e-0000-4000-8000-000000000001/avatar-1760000000000.jpg')).toBe(
      'http://192.168.0.10:54321/storage/v1/object/public/avatars/0b4c1d2e-0000-4000-8000-000000000001/avatar-1760000000000.jpg',
    );
  });
  test('ignora qualquer coisa que não seja um caminho do bucket (ex.: link de outro site)', () => {
    expect(avatarUrl('https://evil.example/x.jpg')).toBeNull();
    expect(avatarUrl('avatars/u1/../u2/avatar-1.jpg')).toBeNull();
    expect(avatarUrl(null)).toBeNull();
  });
});

describe('sessão criptografada no celular', () => {
  const session = JSON.stringify({ access_token: 'eyJ.segredo.123', refresh_token: 'r-456' });

  test('no disco fica só texto cifrado; a chave fica no cofre do sistema', async () => {
    const storage = new EncryptedSessionStorage();
    await storage.setItem('sb-local-auth-token', session);
    const onDisk = localStorage.getItem('sb-local-auth-token')!;
    expect(onDisk).not.toContain('segredo');
    expect(onDisk).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    expect(mockVault.get('soundora.sb-local-auth-token')).toMatch(/^[0-9a-f]{64}$/);
    await expect(storage.getItem('sb-local-auth-token')).resolves.toBe(session);
  });

  test('sem a chave do cofre (app reinstalado) a sessão é descartada', async () => {
    const storage = new EncryptedSessionStorage();
    await storage.setItem('k', session);
    mockVault.clear();
    await expect(storage.getItem('k')).resolves.toBeNull();
    expect(localStorage.getItem('k')).toBeNull();
  });

  test('sessão antiga sem criptografia é descartada (pede login de novo)', async () => {
    localStorage.setItem('velha', session);
    await expect(new EncryptedSessionStorage().getItem('velha')).resolves.toBeNull();
  });

  test('sair apaga o texto e a chave', async () => {
    const storage = new EncryptedSessionStorage();
    await storage.setItem('x', session);
    await storage.removeItem('x');
    expect(localStorage.getItem('x')).toBeNull();
    expect(mockVault.has('soundora.x')).toBe(false);
  });
});
