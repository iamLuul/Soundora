import { commentSchema, displayNameSchema, passwordSchema, postTextSchema, type ReportReason } from '@soundora/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AppError } from './errors';
import { supabase } from './supabase';
import type {
  AppConfig,
  CommentRow,
  DiscoverCard,
  FeedItem,
  LinkPreviewRow,
  Profile,
  ProfileSummary,
  TrackResult,
  TrendingTrack,
} from './types';

export const FEED_PAGE_SIZE = 20;

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('not_authenticated');
  return id;
}

export async function getAppConfig(): Promise<AppConfig> {
  const { data, error } = await supabase.from('app_config').select('min_age, guardian_required_under, guardian_flow_enabled').single();
  if (error) throw error;
  return data;
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
}

export async function completeOnboarding(input: OnboardingInput): Promise<Profile> {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_username: input.username,
    p_display_name: input.displayName,
    p_birthdate: input.birthdate,
    p_genres: input.genres,
    p_locale: input.locale,
  });
  if (error) throw error;
  return data as Profile;
}

/** Pede à Edge Function o cartão de prévia do link. */
export async function previewLink(url: string): Promise<LinkPreviewRow> {
  const { data, error } = await supabase.functions.invoke<{ preview: LinkPreviewRow }>('link-preview', { body: { url } });
  // Sem resposta (FunctionsFetchError / FunctionsRelayError): a função não está rodando ou não foi publicada.
  if (error) throw await functionError('link-preview', error, 'preview_unavailable');
  if (!data?.preview) throw new AppError('generic');
  return data.preview;
}

export async function createPost(input: { previewId: string; body: string; genre: string | null }): Promise<string> {
  const parsed = postTextSchema.safeParse(input.body);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'generic');
  const authorId = await currentUserId();
  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: authorId, link_preview_id: input.previewId, body: parsed.data, genre: input.genre })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function fetchFeed(page: number): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('feed_for_you', { p_limit: FEED_PAGE_SIZE, p_offset: page * FEED_PAGE_SIZE });
  if (error) throw error;
  return data as FeedItem[];
}

export async function fetchProfilePosts(authorId: string, before: string | null): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('profile_posts', { p_author: authorId, p_before: before, p_limit: FEED_PAGE_SIZE });
  if (error) throw error;
  return data as FeedItem[];
}

export async function fetchProfileSummary(username: string): Promise<ProfileSummary | null> {
  const { data, error } = await supabase.rpc('profile_summary', { p_username: username });
  if (error) throw error;
  return ((data as ProfileSummary[])[0] ?? null);
}

export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const userId = await currentUserId();
  const { error } = liked
    ? await supabase.from('likes').insert({ user_id: userId, post_id: postId })
    : await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
  // 23505 = já curtido (duplo toque); não é erro para quem usa.
  if (error && error.code !== '23505') throw error;
}

export async function setFollowing(followeeId: string, follow: boolean): Promise<void> {
  const userId = await currentUserId();
  const { error } = follow
    ? await supabase.from('follows').insert({ follower_id: userId, followee_id: followeeId })
    : await supabase.from('follows').delete().eq('follower_id', userId).eq('followee_id', followeeId);
  if (error && error.code !== '23505') throw error;
}

export async function blockUser(blockedId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

export async function report(targetType: 'post' | 'comment' | 'profile', targetId: string, reason: ReportReason): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: targetType, target_id: targetId, reason });
  if (error && error.code !== '23505') throw error;
}

export async function fetchComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, author_id, body, created_at, author:profiles(username, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return data as unknown as CommentRow[];
}

export async function addComment(postId: string, body: string): Promise<void> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'generic');
  const userId = await currentUserId();
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: userId, body: parsed.data });
  if (error) throw error;
}

export async function updateLocale(locale: 'pt-BR' | 'en'): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('profiles').update({ locale }).eq('id', userId);
  if (error) throw error;
}

export async function fetchDiscoverCards(limit = 20): Promise<DiscoverCard[]> {
  const { data, error } = await supabase.rpc('discover_cards', { p_limit: limit });
  if (error) throw error;
  return data as DiscoverCard[];
}

/** Registra o swipe. Para a direita também curte o post de origem. */
export async function swipeDiscover(card: Pick<DiscoverCard, 'link_preview_id' | 'post_id'>, liked: boolean): Promise<void> {
  const { error } = await supabase.rpc('discover_swipe', {
    p_link_preview_id: card.link_preview_id,
    p_liked: liked,
    p_post_id: card.post_id,
  });
  if (error) throw error;
}

export async function fetchTrending(genre: string | null, days = 7): Promise<TrendingTrack[]> {
  const { data, error } = await supabase.rpc('trending_tracks', { p_days: days, p_genre: genre, p_limit: 50 });
  if (error) throw error;
  return data as TrendingTrack[];
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return data as Profile[];
}

export async function searchTracks(query: string): Promise<TrackResult[]> {
  const { data, error } = await supabase.rpc('search_tracks', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return data as TrackResult[];
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

/** Erro de uma Edge Function → AppError com o código que ela mandou ({ error: 'codigo' }). */
async function functionError(name: string, error: Error, unavailableCode: string): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null);
    const code = typeof body?.error === 'string' ? body.error : 'generic';
    return new AppError(code, `${name} HTTP ${res.status}${body?.detail ? ` – ${body.detail}` : ''}`);
  }
  return new AppError(unavailableCode, `${error.name}: ${error.message}`);
}

/**
 * Reduz a foto para 512 px (JPEG) e manda para a Edge Function upload-avatar, que confere
 * o arquivo (tipo real, tamanho, dimensões) e grava no Storage e no perfil.
 * O app não tem permissão de escrever no bucket direto.
 */
export async function uploadAvatar(localUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(localUri);
  context.resize({ width: 512, height: null });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const bytes = await (await fetch(saved.uri)).arrayBuffer();

  const { data, error } = await supabase.functions.invoke<{ avatar_url: string }>('upload-avatar', {
    body: bytes,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (error) throw await functionError('upload-avatar', error, 'generic');
  if (!data?.avatar_url) throw new AppError('generic');
  return data.avatar_url;
}

export async function removeAvatar(): Promise<void> {
  const { error } = await supabase.functions.invoke('upload-avatar', { method: 'DELETE' });
  if (error) throw await functionError('upload-avatar', error, 'generic');
}

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
