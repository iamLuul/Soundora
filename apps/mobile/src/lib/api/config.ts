// Configuração do app guardada no banco (regras de idade, link de apoio).
import { supabase } from '../supabase';
import type { AppConfig } from '../types';

export async function getAppConfig(): Promise<AppConfig> {
  const { data, error } = await supabase.from('app_config').select('min_age, guardian_required_under, guardian_flow_enabled').single();
  if (error) throw error;
  return data;
}

/** Link da página de apoio (Patreon), mostrado só na versão Web. null = sem botão. */
export async function fetchSupportUrl(): Promise<string | null> {
  const { data, error } = await supabase.from('app_config').select('support_url').single();
  if (error) throw error;
  const url = (data as { support_url: string | null }).support_url;
  // O banco só aceita https://patreon.com/...; confere de novo antes de virar link.
  return url && /^https:\/\/(www\.)?patreon\.com\//.test(url) ? url : null;
}
