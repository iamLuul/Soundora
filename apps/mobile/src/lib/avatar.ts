import { supabaseUrl } from './supabase';

/**
 * O perfil guarda só o caminho da foto no Storage ("avatars/{id}/avatar-123.jpg");
 * a URL é montada aqui, com o endereço do Supabase deste aparelho.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!/^avatars\/[\w-]+\/avatar-\d+\.(jpg|png|webp)$/.test(path)) return null;
  return `${supabaseUrl}/storage/v1/object/public/${path}`;
}

/** Mesma ideia para o banner ("banners/{id}/banner-123.jpg"). */
export function bannerUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!/^banners\/[\w-]+\/banner-\d+\.(jpg|png|webp)$/.test(path)) return null;
  return `${supabaseUrl}/storage/v1/object/public/${path}`;
}
