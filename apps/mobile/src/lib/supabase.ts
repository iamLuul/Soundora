import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { isSecretKey } from './key-guard';
import { resolveServerUrl } from './server-url';
import { createSessionStorage } from './session-storage';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!configuredUrl || !supabasePublishableKey) {
  throw new Error('Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/mobile/.env.local (veja .env.example).');
}
if (isSecretKey(supabasePublishableKey)) {
  // A chave secreta ignora todas as regras de segurança do banco. O app nem abre com ela.
  throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY recebeu a chave SECRETA. Use a publishable key (sb_publishable_...). A secreta só vai nas Edge Functions.');
}

/** Endereço do Supabase usado de fato (no celular, localhost vira o IP do PC). */
export const supabaseUrl = resolveServerUrl(configuredUrl, {
  platform: Platform.OS,
  isDev: __DEV__,
  hostUri: Constants.expoConfig?.hostUri,
});

const isTest = process.env.NODE_ENV === 'test';
if (__DEV__ && !isTest) console.log(`[Soundhora] Supabase em ${supabaseUrl}`);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // Celular: sessão criptografada (chave no Keychain/Keystore). Web: localStorage.
    storage: createSessionStorage(),
    // Nos testes, sem o timer de renovação (ele deixava o Jest sem terminar).
    autoRefreshToken: !isTest,
    persistSession: true,
    // Na Web a sessão do login social volta na URL; no celular, não.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

// No celular, só renova o token com o app em primeiro plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
