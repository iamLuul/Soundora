import { commentSchema, displayNameSchema, passwordSchema, postTextSchema, type ReportReason } from '@soundora/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AppError } from './errors';
import { convertProfileImage } from './image-convert';
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

/**
 * Uma página do feed. `openedAt` é o instante em que a pessoa abriu o feed: todas as páginas
 * usam o mesmo, então a ordem não muda no meio da rolagem (sem posts repetidos ou pulados).
 */
export async function fetchFeed(page: number, openedAt: string): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('feed_for_you', { p_limit: FEED_PAGE_SIZE, p_offset: page * FEED_PAGE_SIZE, p_now: openedAt });
  if (error) throw error;
  return data as FeedItem[];
}

/** Cursor dos posts de um perfil: o último post da página anterior (data e id, para desempatar). */
export interface PostCursor {
  createdAt: string;
  id: string;
}

export async function fetchProfilePosts(authorId: string, before: PostCursor | null): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('profile_posts', {
    p_author: authorId,
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: FEED_PAGE_SIZE,
  });
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

export type ProfileImageKind = 'avatar' | 'banner';

/** Tamanho final de cada imagem: foto quadrada de 512 px, banner 3:1 com 1500 px. */
/**
 * Converte no aparelho (recorte, tamanho exato, JPEG sem metadados: lib/image-convert) e
 * envia só o resultado para a Edge Function, que confere tudo de novo antes de gravar.
 */
export async function uploadProfileImage(
  kind: ProfileImageKind,
  image: { uri: string; width: number; height: number },
): Promise<string> {
  const bytes = await convertProfileImage(kind, image.uri, image.width, image.height);
  // ArrayBuffer (não Uint8Array): com Content-Type próprio, o supabase-js transformaria um
  // Uint8Array em JSON.
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const { data, error } = await supabase.functions.invoke<{ path: string }>(`profile-image?kind=${kind}`, {
    body,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (error) throw await functionError('profile-image', error, 'generic');
  if (!data?.path) throw new AppError('generic');
  return data.path;
}

export async function removeProfileImage(kind: ProfileImageKind): Promise<void> {
  const { error } = await supabase.functions.invoke(`profile-image?kind=${kind}`, { method: 'DELETE' });
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
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm } });
  if (error) throw await functionError('delete-account', error, 'generic');
}

/** Uma música (cartão de prévia) numa lista simples. */
export interface TrackItem {
  link_preview_id: string;
  url: string;
  platform: LinkPreviewRow['platform'];
  title: string;
  artist: string | null;
  image_url: string | null;
}

const TRACK_COLUMNS = 'id, url, platform, title, artist, image_url';

type PreviewJoin = { id: string; url: string; platform: LinkPreviewRow['platform']; title: string; artist: string | null; image_url: string | null };
const toTrack = (p: PreviewJoin): TrackItem => ({
  link_preview_id: p.id,
  url: p.url,
  platform: p.platform,
  title: p.title,
  artist: p.artist,
  image_url: p.image_url,
});

/** Músicas que a pessoa curtiu no Descobrir (mais recentes primeiro). */
export async function fetchLikedTracks(): Promise<TrackItem[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('discover_swipes')
    .select(`created_at, link_previews(${TRACK_COLUMNS})`)
    .eq('user_id', userId)
    .eq('liked', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as unknown as { link_previews: PreviewJoin | null }[]).flatMap((r) => (r.link_previews ? [toTrack(r.link_previews)] : []));
}

/** Músicas que a pessoa postou (sem repetir a mesma música). */
export async function fetchMyTracks(): Promise<TrackItem[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('posts')
    .select(`created_at, link_previews(${TRACK_COLUMNS})`)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const seen = new Set<string>();
  return (data as unknown as { link_previews: PreviewJoin | null }[]).flatMap((r) => {
    if (!r.link_previews || seen.has(r.link_previews.id)) return [];
    seen.add(r.link_previews.id);
    return [toTrack(r.link_previews)];
  });
}

export interface FollowedProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/** Quem a pessoa segue, para a fila de avatares do topo do feed. */
export async function fetchFollowing(): Promise<FollowedProfile[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('follows')
    .select('created_at, profile:profiles!follows_followee_id_fkey(username, display_name, avatar_url)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data as unknown as { profile: FollowedProfile | null }[]).flatMap((r) => (r.profile ? [r.profile] : []));
}
