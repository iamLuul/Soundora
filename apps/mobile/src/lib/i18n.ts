import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ptBR from '../locales/pt-BR.json';

export type AppLocale = 'pt-BR' | 'en';
export const LOCALES: AppLocale[] = ['pt-BR', 'en'];

/** Português para quem usa o aparelho em português; inglês para o resto. */
export function deviceLocale(): AppLocale {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return code === 'pt' ? 'pt-BR' : 'en';
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  lng: deviceLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false, // recursos já estão no bundle: inicia na hora
});

/** "agora", "5 min", "3 h", "2 d" */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return i18n.t('time.now');
  if (min < 60) return i18n.t('time.minutes', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.t('time.hours', { count: h });
  return i18n.t('time.days', { count: Math.floor(h / 24) });
}

export default i18n;
