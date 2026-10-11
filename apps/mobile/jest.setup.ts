// Variáveis falsas para que módulos que criam o cliente Supabase possam ser importados nos testes.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-key';

// O localStorage do expo-sqlite e o cofre do sistema não existem no Jest: versões em memória.
jest.mock('expo-sqlite/localStorage/install', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return {};
});
jest.mock('expo-secure-store', () => {
  const vault = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: async (k: string) => vault.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void vault.set(k, v),
    deleteItemAsync: async (k: string) => void vault.delete(k),
  };
});

// expo-video usa um módulo nativo: no Jest, um player de mentira e uma view vazia.
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }), playing: false, currentTime: 0, duration: 0 }),
  VideoView: () => null,
}));
