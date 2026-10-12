import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
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

// Web: o <html lang> acompanha o idioma do app (leitores de tela leem com a pronúncia certa).
function syncDocumentLang(lng: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lng;
}
syncDocumentLang(i18n.language);
i18n.on('languageChanged', syncDocumentLang);

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

/**
 * Data e hora exatas, no idioma do app e no fuso do aparelho
 * (ex.: "12 de out. de 2026 às 14:35" / "Oct 12, 2026 at 2:35 PM").
 */
export function exactTime(iso: string): string {
  const d = new Date(iso);
  const lang = i18n.language || 'pt-BR';
  const date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  return i18n.t('time.exact', { date, time });
}

export default i18n;
