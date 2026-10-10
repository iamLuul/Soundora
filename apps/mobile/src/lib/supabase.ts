import './storage-polyfill';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { resolveServerUrl } from './server-url';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!configuredUrl || !supabasePublishableKey) {
  throw new Error('Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/mobile/.env.local (veja .env.example).');
}

/** Endereço do Supabase usado de fato (no celular, localhost vira o IP do PC). */
export const supabaseUrl = resolveServerUrl(configuredUrl, {
  platform: Platform.OS,
  isDev: __DEV__,
  hostUri: Constants.expoConfig?.hostUri,
});

if (__DEV__) console.log(`[Soundora] Supabase em ${supabaseUrl}`);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // Na renderização estática da Web (Node) não existe localStorage.
    storage: typeof localStorage === 'undefined' ? undefined : localStorage,
    autoRefreshToken: true,
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
