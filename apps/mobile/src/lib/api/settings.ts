// Configurações da conta: privacidade, idioma, streaming, gêneros silenciados, consentimento e histórico de pesquisa.
import { isStreamingChoice, type StreamingChoice } from '@soundhora/core';
import { supabase } from '../supabase';
import { currentUserId } from './client';

export async function setPrivateAccount(isPrivate: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_private', { p_private: isPrivate });
  if (error) throw error;
}

export type Gender = 'female' | 'male' | 'non_binary' | 'other';

/** Dados da tela "Sua conta" (só da própria pessoa). */
export interface MyAccount {
  created_at: string;
  birthdate: string;
  age: number;
  is_minor: boolean;
  has_guardian: boolean;
  gender: Gender | null;
  is_private: boolean;
}

export async function fetchMyAccount(): Promise<MyAccount | null> {
  const { data, error } = await supabase.rpc('my_account');
  if (error) throw error;
  return (data as MyAccount[])[0] ?? null;
}

export async function setGender(gender: Gender | null): Promise<void> {
  const { error } = await supabase.rpc('set_gender', { p_gender: gender });
  if (error) throw error;
}

/** Gêneros silenciados (somem do Para você e do Descobrir). */
export async function fetchMutedGenres(): Promise<string[]> {
  const { data, error } = await supabase.from('muted_genres').select('genre').order('created_at');
  if (error) throw error;
  return data.map((r) => r.genre as string);
}

export async function setMutedGenres(genres: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_muted_genres', { p_genres: genres });
  if (error) throw error;
}

/** Registra no servidor a escolha de cookies da pessoa logada (prova do consentimento, LGPD). */
export async function recordCookieConsent(
  choice: { preferences: boolean; personalization: boolean; version: number },
  platform: 'web' | 'android' | 'ios',
): Promise<void> {
  const { error } = await supabase.rpc('record_cookie_consent', {
    p_preferences: choice.preferences,
    p_personalization: choice.personalization,
    p_version: choice.version,
    p_platform: platform,
  });
  if (error) throw error;
}

export async function updateLocale(locale: 'pt-BR' | 'en'): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('profiles').update({ locale }).eq('id', userId);
  if (error) throw error;
}

/** Plataforma de streaming que a pessoa usa (só ela vê). null = ainda não escolheu. */
export async function getStreamingPlatform(): Promise<StreamingChoice | null> {
  const { data, error } = await supabase.from('profile_private').select('streaming_platform').maybeSingle();
  if (error) throw error;
  const value: unknown = data?.streaming_platform;
  return isStreamingChoice(value) ? value : null;
}

export async function setStreamingPlatform(platform: StreamingChoice): Promise<void> {
  const { error } = await supabase.rpc('set_streaming_platform', { p_platform: platform });
  if (error) throw error;
}

/**
 * Guarda uma pesquisa feita de verdade (Enter, abrir um gênero, buscar nos posts) para as
 * recomendações. O servidor ignora se a pessoa desligou, e nunca dá erro por isso; aqui
 * também nada quebra se falhar (é só para recomendar).
 */
export function logSearch(term: string): void {
  const t = term.trim();
  if (t.length < 2) return;
  try {
    void Promise.resolve(supabase.rpc('log_search', { p_term: t.slice(0, 100) })).catch(() => undefined);
  } catch {
    // sem conexão/cliente: a pesquisa só não entra no histórico
  }
}

export interface SearchHistory {
  enabled: boolean;
  items: { term: string; searched_at: string }[];
}

export async function fetchSearchHistory(): Promise<SearchHistory> {
  const { data, error } = await supabase.rpc('my_search_history', { p_limit: 100 });
  if (error) throw error;
  const rows = (data ?? []) as { enabled: boolean; term: string | null; searched_at: string | null }[];
  return {
    enabled: rows[0]?.enabled ?? false,
    items: rows.filter((r) => r.term && r.searched_at).map((r) => ({ term: r.term!, searched_at: r.searched_at! })),
  };
}

/** Desligar também apaga as pesquisas guardadas. */
export async function setSearchHistoryEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_search_history_enabled', { p_enabled: enabled });
  if (error) throw error;
}

/** Apaga uma pesquisa (term) ou todas (sem term). */
export async function clearSearchHistory(term?: string): Promise<void> {
  const { error } = await supabase.rpc('clear_search_history', { p_term: term ?? null });
  if (error) throw error;
}
