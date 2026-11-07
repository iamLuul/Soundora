// Perfil: o meu (onboarding, editar, foto, @, senha, excluir conta) e o dos outros (resumo, selos, favoritas, gêneros).
import { displayNameSchema, passwordSchema, type StreamingChoice } from '@soundhora/core';
import { AppError } from '../errors';
import { convertProfileImage } from '../image-convert';
import { imageContentType } from '../image-plan';
import { supabase } from '../supabase';
import type { Profile, ProfileSummary } from '../types';
import { currentUserId, functionError, invokeFunction } from './client';

/** Um selo do perfil (só exibição; não dá vantagem nenhuma). */
export interface ProfileBadge {
  slug: string;
  icon: string;
  name_pt: string;
  name_en: string;
  description_pt: string;
  description_en: string;
  granted_at: string;
  /** Não dá mais para receber (pausado ou encerrado). */
  limited: boolean;
}

export async function fetchProfileBadges(userId: string): Promise<ProfileBadge[]> {
  const { data, error } = await supabase.rpc('profile_badges', { p_user: userId });
  if (error) throw error;
  return (data ?? []) as ProfileBadge[];
}

export async function getMyProfile(): Promise<Profile | null> {
  const id = await currentUserId();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMyGenres(): Promise<string[]> {
  const id = await currentUserId();
  const { data, error } = await supabase.from('user_genres').select('genre').eq('user_id', id);
  if (error) throw error;
  return data.map((r) => r.genre);
}

/** Troca os gêneros do perfil (adiciona os novos e tira os que saíram). */
export async function setMyGenres(next: string[]): Promise<void> {
  const id = await currentUserId();
  const current = await getMyGenres();
  const add = next.filter((g) => !current.includes(g));
  const remove = current.filter((g) => !next.includes(g));
  if (add.length) {
    const { error } = await supabase.from('user_genres').insert(add.map((genre) => ({ user_id: id, genre })));
    if (error) throw error;
  }
  if (remove.length) {
    const { error } = await supabase.from('user_genres').delete().eq('user_id', id).in('genre', remove);
    if (error) throw error;
  }
}

/** true se o username está livre (o formato também é conferido no banco). */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', { p_username: username });
  if (error) throw error;
  return data === true;
}

export interface OnboardingInput {
  username: string;
  displayName: string;
  birthdate: string;
  genres: string[];
  locale: 'pt-BR' | 'en';
  streamingPlatform: StreamingChoice;
}

export async function completeOnboarding(input: OnboardingInput): Promise<Profile> {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_username: input.username,
    p_display_name: input.displayName,
    p_birthdate: input.birthdate,
    p_genres: input.genres,
    p_locale: input.locale,
    p_streaming_platform: input.streamingPlatform,
  });
  if (error) throw error;
  return data as Profile;
}

export async function fetchProfileSummary(username: string): Promise<ProfileSummary | null> {
  const { data, error } = await supabase.rpc('profile_summary', { p_username: username });
  if (error) throw error;
  return (data as ProfileSummary[])[0] ?? null;
}

/** Até 5 músicas favoritas no perfil. */
export const FAVORITE_SONGS_MAX = 5;

/** Gêneros mostrados no perfil (a pessoa pode ter mais). */
export const PROFILE_GENRES_MAX = 5;

export interface FavoriteSong {
  slot: number;
  link_preview_id: string;
  title: string;
  artist: string | null;
  image_url: string | null;
  url: string;
  platform: string;
}

/** Música achada na busca (Deezer), antes de escolher. */
export interface SongHit {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  image_url: string | null;
}

export async function fetchFavoriteSongs(userId: string): Promise<FavoriteSong[]> {
  const { data, error } = await supabase.rpc('favorite_songs', { p_user: userId });
  if (error) throw error;
  return (data ?? []) as FavoriteSong[];
}

/** Troca a lista de favoritas (a ordem da lista é a ordem no perfil). */
export async function setFavoriteSongs(previewIds: string[]): Promise<void> {
  if (previewIds.length > FAVORITE_SONGS_MAX) throw new AppError('invalid_request');
  const { error } = await supabase.rpc('set_favorite_songs', { p_ids: previewIds });
  if (error) throw error;
}

export async function searchSongs(query: string): Promise<SongHit[]> {
  const { data, error } = await invokeFunction<{ tracks: SongHit[] }>('discover', { body: { action: 'tracks', query } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  return data?.tracks ?? [];
}

/** Escolhe uma música da busca: o servidor guarda o cartão e devolve. */
export async function pickSong(trackId: string): Promise<Omit<FavoriteSong, 'slot'>> {
  const { data, error } = await invokeFunction<{
    song: { id: string; title: string; artist: string | null; image_url: string | null; url: string; platform: string };
  }>('discover', {
    body: { action: 'track', trackId },
  });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  if (!data?.song) throw new AppError('discover_unavailable');
  const s = data.song;
  return { link_preview_id: s.id, title: s.title, artist: s.artist, image_url: s.image_url, url: s.url, platform: s.platform };
}

/** Gêneros que a pessoa escolheu (destaques primeiro). */
export async function fetchUserGenres(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('user_genres').select('genre, genres(featured, rank)').eq('user_id', userId);
  if (error) throw error;
  type Row = { genre: string; genres: { featured: boolean; rank: number | null } | null };
  return ((data ?? []) as unknown as Row[])
    .sort(
      (a, b) =>
        Number(!!b.genres?.featured) - Number(!!a.genres?.featured) || (a.genres?.rank ?? 1e9) - (b.genres?.rank ?? 1e9) || a.genre.localeCompare(b.genre),
    )
    .map((r) => r.genre);
}

export const BIO_MAX = 160;

export async function updateProfile(input: { displayName: string; bio: string }): Promise<void> {
  const name = displayNameSchema.safeParse(input.displayName);
  if (!name.success) throw new AppError(name.error.issues[0]?.message ?? 'generic');
  const bio = input.bio.trim();
  if (bio.length > BIO_MAX) throw new AppError('bio_too_long');
  const userId = await currentUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.data, bio: bio || null })
    .eq('id', userId);
  if (error) throw error;
}

export type ProfileImageKind = 'avatar' | 'banner';

/** Tamanho final de cada imagem: foto quadrada de 512 px, banner 3:1 com 1500 px. */
/**
 * Converte no aparelho (recorte, tamanho exato, WebP sem metadados: lib/image-convert) e
 * envia só o resultado para a Edge Function, que confere tudo de novo antes de gravar.
 */
export async function uploadProfileImage(kind: ProfileImageKind, image: { uri: string; width: number; height: number }): Promise<string> {
  const bytes = await convertProfileImage(kind, image.uri, image.width, image.height);
  // ArrayBuffer (não Uint8Array): com Content-Type próprio, o supabase-js transformaria um
  // Uint8Array em JSON.
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const { data, error } = await invokeFunction<{ path: string }>(`profile-image?kind=${kind}`, {
    body,
    headers: { 'Content-Type': imageContentType(bytes) },
  });
  if (error) throw await functionError('profile-image', error, 'generic');
  if (!data?.path) throw new AppError('generic');
  return data.path;
}

export async function removeProfileImage(kind: ProfileImageKind): Promise<void> {
  const { error } = await invokeFunction(`profile-image?kind=${kind}`, { method: 'DELETE' });
  if (error) throw await functionError('profile-image', error, 'generic');
}

/** Troca o @ (uma vez a cada 30 dias). Devolve o @ novo. */
export async function changeUsername(username: string): Promise<string> {
  const { data, error } = await supabase.rpc('change_username', { p_username: username });
  if (error) throw error;
  return data as string;
}

/** Dias de espera entre duas trocas de @ (igual à função change_username no banco). */
export const USERNAME_CHANGE_DAYS = 30;

/**
 * Define ou troca a senha da conta logada. Com `secure_password_change` ligado, uma sessão
 * com mais de 24 h precisa do código de reautenticação (`nonce`), enviado por
 * requestReauthentication(); sem ele, o Supabase responde "reauthentication_needed".
 */
export async function changePassword(password: string, nonce?: string): Promise<void> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'password_too_short');
  const { error } = await supabase.auth.updateUser(nonce ? { password: parsed.data, nonce } : { password: parsed.data });
  if (error) throw error;
}

/** Envia ao e-mail da conta o código que confirma a troca de senha. */
export async function requestReauthentication(): Promise<void> {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw error;
}

/**
 * Exclui a conta (Edge Function delete-account). `confirm` é o @ da pessoa. O servidor
 * exige login recente: se for antigo, responde "reauth_required".
 */
export async function deleteAccount(confirm: string): Promise<void> {
  const { error } = await invokeFunction('delete-account', { body: { confirm } });
  if (error) throw await functionError('delete-account', error, 'generic');
}
