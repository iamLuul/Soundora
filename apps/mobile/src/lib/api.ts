import { commentSchema, displayNameSchema, isStreamingChoice, passwordSchema, postTextSchema, type ReportReason, type StreamingChoice } from '@soundora/core';
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
  LikedSong,
  PersonCard,
  Profile,
  ProfileSummary,
  TrackResult,
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

/** Pede à Edge Function o cartão de prévia do link. */
export async function previewLink(url: string): Promise<LinkPreviewRow> {
  const { data, error } = await invokeFunction<{ preview: LinkPreviewRow }>('link-preview', { body: { url } });
  // Sem resposta (FunctionsFetchError / FunctionsRelayError): a função não está rodando ou não foi publicada.
  if (error) throw await functionError('link-preview', error, 'preview_unavailable');
  if (!data?.preview) throw new AppError('generic');
  return data.preview;
}

/** Limites do post: texto, até 4 fotos ou 1 vídeo, até 3 gêneros (iguais aos do banco). */
export const POST_LIMITS = { photos: 4, genres: 3 } as const;

export interface NewPostMedia {
  path: string;
  kind: 'photo' | 'video';
  width: number;
  height: number;
  duration_ms?: number | null;
}

/** Publica: texto, música (opcional), gêneros e mídia já enviada (uploadMedia). */
export async function createPost(input: { body: string; previewId?: string | null; genres?: string[]; media?: NewPostMedia[] }): Promise<string> {
  const parsed = postTextSchema.safeParse(input.body);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'generic');
  const { data, error } = await supabase.rpc('post_create', {
    p_body: parsed.data,
    p_link_preview_id: input.previewId ?? null,
    p_genres: input.genres ?? [],
    p_media: input.media ?? [],
  });
  if (error) throw error;
  return data as string;
}

/** Um post aberto (tela cheia com comentários). null se não existe ou há bloqueio. */
export async function fetchPost(id: string): Promise<FeedItem | null> {
  const { data, error } = await supabase.rpc('post_detail', { p_post: id });
  if (error) throw error;
  return ((data ?? []) as FeedItem[])[0] ?? null;
}

/** Posts que a pessoa curtiu (página seguinte: depois do último post recebido). */
/** Músicas que a pessoa curtiu no Descobrir (perfil › Curtidas), em páginas. */
export const LIKED_SONGS_PAGE = 30;
export async function fetchProfileLikedSongs(userId: string, before: { liked_at: string; link_preview_id: string } | null): Promise<LikedSong[]> {
  const { data, error } = await supabase.rpc('profile_liked_songs', {
    p_user: userId,
    p_before: before?.liked_at ?? null,
    p_before_id: before?.link_preview_id ?? null,
    p_limit: LIKED_SONGS_PAGE,
  });
  if (error) throw error;
  return (data ?? []) as LikedSong[];
}

export interface PersonRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  i_follow: boolean;
  is_me: boolean;
}

export const PEOPLE_PAGE = 30;

export async function fetchPeople(username: string, list: 'followers' | 'following', page: number): Promise<PersonRow[]> {
  const { data, error } = await supabase.rpc('profile_people', { p_username: username, p_list: list, p_limit: PEOPLE_PAGE, p_offset: page * PEOPLE_PAGE });
  if (error) throw error;
  return (data ?? []) as PersonRow[];
}

/** URLs temporárias (1 h) da mídia dos posts, de uma vez só. */
export async function postMediaUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from('post-media').createSignedUrls(paths, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/**
 * Assina mídias em lote: os posts que aparecem juntos (uma página do feed) pedem as URLs no
 * mesmo instante, e isto junta tudo numa chamada só ao Storage (em vez de uma por post).
 */
const MEDIA_BATCH_MS = 16;
const MEDIA_BATCH_MAX = 100;
let mediaQueue: { paths: string[]; resolve: (urls: Record<string, string>) => void; reject: (err: unknown) => void }[] = [];
let mediaTimer: ReturnType<typeof setTimeout> | null = null;

function flushMediaQueue() {
  const batch = mediaQueue;
  mediaQueue = [];
  mediaTimer = null;
  const all = [...new Set(batch.flatMap((b) => b.paths))];
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += MEDIA_BATCH_MAX) chunks.push(all.slice(i, i + MEDIA_BATCH_MAX));
  Promise.all(chunks.map((c) => postMediaUrls(c)))
    .then((parts) => {
      const urls = Object.assign({}, ...parts) as Record<string, string>;
      for (const b of batch) b.resolve(Object.fromEntries(b.paths.filter((p) => urls[p]).map((p) => [p, urls[p]!])));
    })
    .catch((err: unknown) => batch.forEach((b) => b.reject(err)));
}

export function signPostMedia(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    mediaQueue.push({ paths, resolve, reject });
    mediaTimer ??= setTimeout(flushMediaQueue, MEDIA_BATCH_MS);
  });
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

/** Aba Seguindo: só quem eu sigo (e eu), do mais novo ao mais velho. */
export async function fetchFollowingFeed(before: PostCursor | null): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('feed_following', {
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw error;
  return data as FeedItem[];
}

/** Por que a conta foi sugerida: gêneros parecidos, posts que curti ou seguida por quem sigo. */
export type SuggestionReason = 'genres' | 'liked' | 'friends';
export interface SuggestedAccount {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  /** Até 2 gêneros em comum com o meu gosto (slugs). */
  genres: string[];
  reason: SuggestionReason;
}

export async function fetchSuggestedAccounts(limit = 12): Promise<SuggestedAccount[]> {
  const { data, error } = await supabase.rpc('suggested_accounts', { p_limit: limit });
  if (error) throw error;
  return data as SuggestedAccount[];
}

/** Ids de quem eu sigo (para o botão Seguir dos posts). */
export async function fetchMyFollowingIds(): Promise<string[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', userId).limit(5000);
  if (error) throw error;
  return (data as { followee_id: string }[]).map((r) => r.followee_id);
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

export async function unblockUser(blockedId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId);
  if (error) throw error;
}

export async function report(targetType: 'post' | 'comment' | 'profile' | 'vibe' | 'review', targetId: string, reason: ReportReason): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: targetType, target_id: targetId, reason });
  if (error && error.code !== '23505') throw error;
}

export async function fetchComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase.rpc('post_comments', { p_post: postId });
  if (error) throw error;
  return (data ?? []) as CommentRow[];
}

/** Comenta no post; com parentId, responde a um comentário (o servidor pendura no principal). */
export async function addComment(postId: string, body: string, parentId: string | null = null): Promise<void> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'generic');
  const userId = await currentUserId();
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: userId, body: parsed.data, parent_id: parentId });
  if (error) throw error;
}

export async function setCommentLiked(commentId: string, liked: boolean): Promise<void> {
  const userId = await currentUserId();
  const { error } = liked
    ? await supabase.from('comment_likes').insert({ user_id: userId, comment_id: commentId })
    : await supabase.from('comment_likes').delete().eq('user_id', userId).eq('comment_id', commentId);
  // Clique duplo: já curtido conta como sucesso.
  if (error && error.code !== '23505') throw error;
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

/** Uma música do ranking mundial (Edge Function music-charts). */
export interface ChartTrack {
  position: number;
  key: string;
  title: string;
  artist: string;
  album: string | null;
  image_url: string | null;
  /** Subiu, caiu, manteve, entrou agora, ou null (sem ranking anterior para comparar). */
  move: 'up' | 'down' | 'same' | 'new' | null;
  previous_position: number | null;
}

/** Sugestões do algoritmo para o Descobrir (ou só de um gênero). */
export async function fetchRecommendations(genre: string | null): Promise<DiscoverCard[]> {
  const { data, error } = await invokeFunction<{ cards: Omit<DiscoverCard, 'kind' | 'source' | 'note' | 'post_id' | 'recommender_username' | 'recommender_display_name' | 'recommender_avatar_url'>[] }>(
    'discover',
    { body: { action: 'deck', ...(genre ? { genre } : {}) } },
  );
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  return (data?.cards ?? []).map((c) => ({
    ...c,
    kind: 'track',
    source: 'for_you',
    note: null,
    post_id: null,
    recommender_username: null,
    recommender_display_name: null,
    recommender_avatar_url: null,
  }));
}

/** Músicas que curti no Descobrir. */
export async function fetchLikedSongs(): Promise<LikedSong[]> {
  const { data, error } = await supabase.rpc('discover_liked', { p_limit: 100 });
  if (error) throw error;
  return data as LikedSong[];
}

/** Prévia renovada de um cartão do Descobrir (a da Deezer vence pelo próprio link). */
export async function refreshDiscoverAudio(previewId: string): Promise<string | null> {
  const { data, error } = await invokeFunction<{ audio_url: string | null }>('discover', { body: { action: 'audio', previewId } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  const url = data?.audio_url ?? null;
  // Só https (em desenvolvimento, aceita http para servidores locais de teste).
  return url && (url.startsWith('https://') || (__DEV__ && url.startsWith('http://'))) ? url : null;
}

/** Link de uma música (cartão) na plataforma escolhida: exato, ou a busca nela. */
export async function trackLink(previewId: string, platform: StreamingChoice): Promise<string> {
  const { data, error } = await invokeFunction<{ url: string }>('discover', { body: { action: 'link', previewId, platform } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  if (!data?.url || !data.url.startsWith('https://')) throw new AppError('generic');
  return data.url;
}

/** As mais tocadas no mundo (Last.fm), pelo servidor. */
export async function fetchWorldChart(): Promise<{ updated_at: string; stale: boolean; entries: ChartTrack[] }> {
  const { data, error } = await invokeFunction('music-charts', { body: { action: 'chart' } });
  if (error) throw await functionError('music-charts', error, 'charts_unavailable');
  return data as { updated_at: string; stale: boolean; entries: ChartTrack[] };
}

/** Link da música do ranking na plataforma escolhida (exato, ou a busca dela na plataforma). */
export async function chartTrackLink(key: string, platform: StreamingChoice): Promise<string> {
  const { data, error } = await invokeFunction<{ url: string }>('music-charts', { body: { action: 'link', key, platform } });
  if (error) throw await functionError('music-charts', error, 'charts_unavailable');
  if (!data?.url || !data.url.startsWith('https://')) throw new AppError('generic');
  return data.url;
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

export async function searchProfiles(query: string): Promise<PersonCard[]> {
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return data as PersonCard[];
}

/** Quem eu bloqueei (o mais recente primeiro). */
export async function fetchBlockedProfiles(): Promise<PersonCard[]> {
  const { data, error } = await supabase.rpc('my_blocked_profiles');
  if (error) throw error;
  return data as PersonCard[];
}

export async function searchTracks(query: string): Promise<TrackResult[]> {
  const { data, error } = await supabase.rpc('search_tracks', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return data as TrackResult[];
}

/** Gêneros que batem com o texto, com quantos posts têm cada um (os com posts primeiro). */
export interface GenreHit {
  slug: string;
  name_pt: string;
  name_en: string;
  post_count: number;
}

export async function searchPostGenres(query: string): Promise<GenreHit[]> {
  const { data, error } = await supabase.rpc('search_post_genres', { p_query: query.toLowerCase(), p_limit: 8 });
  if (error) throw error;
  return data as GenreHit[];
}

/** Posts marcados com o gênero, do mais novo ao mais velho. */
export async function fetchGenrePosts(genre: string, before: PostCursor | null): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('genre_posts', {
    p_genre: genre,
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw error;
  return data as FeedItem[];
}

/** Posts cujo texto contém a palavra, do mais novo ao mais velho. */
export async function searchPosts(query: string, before: PostCursor | null): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('search_posts', {
    p_query: query,
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw error;
  return data as FeedItem[];
}

// ---------------------------------------------------------------- reviews de álbuns

/** Nota da review: 0 a 10, uma casa decimal (5 estrelas, cada uma vale 2). */
export const REVIEW_RATING_MAX = 10;
/** Texto da review: de 20 a 5000 letras. */
export const REVIEW_BODY = { min: 20, max: 5000 } as const;
export const REVIEWS_PAGE = 20;

/** Álbum achado na busca (Deezer), antes de escolher. */
export interface AlbumHit {
  id: string;
  title: string;
  artist: string;
  image_url: string | null;
  record_type: string | null;
}

/** Álbum escolhido (cartão guardado no servidor). */
export interface AlbumCard {
  id: string;
  title: string;
  artist: string | null;
  image_url: string | null;
  release_year: number | null;
}

export interface AlbumReview {
  id: string;
  rating: number;
  body: string;
  like_count: number;
  liked_by_me: boolean;
  created_at: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  album_id: string;
  album_title: string;
  album_artist: string | null;
  album_image_url: string | null;
  album_url: string;
  album_platform: string;
  album_year: number | null;
}

/** Busca álbuns pelo nome (na Deezer, pelo servidor). */
export async function searchAlbums(query: string): Promise<AlbumHit[]> {
  const { data, error } = await invokeFunction<{ albums: AlbumHit[] }>('discover', { body: { action: 'albums', query } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  return data?.albums ?? [];
}

/** Escolhe um álbum da busca: o servidor guarda o cartão e devolve. */
export async function pickAlbum(albumId: string): Promise<AlbumCard> {
  const { data, error } = await invokeFunction<{ album: AlbumCard }>('discover', { body: { action: 'album', albumId } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  if (!data?.album) throw new AppError('discover_unavailable');
  return data.album;
}

/** Nota com uma casa decimal, entre 0 e 10. */
export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(Math.max(value, 0), REVIEW_RATING_MAX) * 10) / 10;
}

export async function createReview(input: { albumId: string; rating: number; body: string }): Promise<string> {
  const body = input.body.trim();
  if (body.length < REVIEW_BODY.min) throw new AppError('review_too_short');
  if (body.length > REVIEW_BODY.max) throw new AppError('review_too_long');
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('album_reviews')
    .insert({ author_id: userId, album_id: input.albumId, rating: clampRating(input.rating), body })
    .select('id')
    .single();
  // 23505 = já tem review desse álbum.
  if (error?.code === '23505') throw new AppError('review_exists');
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface ReviewCursor {
  createdAt: string;
  id: string;
}

export async function fetchReviews(before: ReviewCursor | null, filter: { author?: string; album?: string } = {}): Promise<AlbumReview[]> {
  const { data, error } = await supabase.rpc('reviews_feed', {
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: REVIEWS_PAGE,
    p_author: filter.author ?? null,
    p_album: filter.album ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as AlbumReview[]).map((r) => ({ ...r, rating: Number(r.rating) }));
}

export async function setReviewLiked(reviewId: string, liked: boolean): Promise<void> {
  const userId = await currentUserId();
  const { error } = liked
    ? await supabase.from('review_likes').insert({ user_id: userId, review_id: reviewId })
    : await supabase.from('review_likes').delete().eq('user_id', userId).eq('review_id', reviewId);
  if (error && error.code !== '23505') throw error;
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.from('album_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

/** Álbum no Top Reviews: posição, média das notas e quantas reviews. */
export interface TopAlbum {
  rank: number;
  album_id: string;
  title: string;
  artist: string | null;
  image_url: string | null;
  url: string;
  platform: string;
  year: number | null;
  review_count: number;
  average: number;
}

const toTopAlbum = (r: TopAlbum): TopAlbum => ({ ...r, average: Number(r.average) });

/** Em alta › Top Reviews: os álbuns com as maiores médias (ordem que não deixa uma nota só liderar). */
export async function fetchTopAlbums(limit = 50): Promise<TopAlbum[]> {
  const { data, error } = await supabase.rpc('top_reviewed_albums', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as TopAlbum[]).map(toTopAlbum);
}

/** Média e posição de um álbum (null = ainda sem reviews). */
export async function fetchAlbumSummary(albumId: string): Promise<TopAlbum | null> {
  const { data, error } = await supabase.rpc('top_reviewed_albums', { p_limit: 1, p_album: albumId });
  if (error) throw error;
  const row = ((data ?? []) as TopAlbum[])[0];
  return row ? toTopAlbum(row) : null;
}

// ---------------------------------------------------------------- perfil: favoritas e gêneros

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
  const { data, error } = await invokeFunction<{ song: { id: string; title: string; artist: string | null; image_url: string | null; url: string; platform: string } }>('discover', {
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
    .sort((a, b) => Number(!!b.genres?.featured) - Number(!!a.genres?.featured) || (a.genres?.rank ?? 1e9) - (b.genres?.rank ?? 1e9) || a.genre.localeCompare(b.genre))
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

/** Erro de uma Edge Function → AppError com o código que ela mandou ({ error: 'codigo' }). */
/**
 * Chama uma Edge Function. Se o servidor responder 401 (token de login vencido, por exemplo
 * depois de o app ficar em segundo plano), renova a sessão e tenta de novo uma vez.
 */
async function invokeFunction<T = unknown>(name: string, options?: Parameters<typeof supabase.functions.invoke>[1]) {
  const first = await supabase.functions.invoke<T>(name, options);
  if (!(first.error instanceof FunctionsHttpError) || (first.error.context as Response).status !== 401) return first;
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return first;
  return supabase.functions.invoke<T>(name, options);
}

async function functionError(name: string, error: Error, unavailableCode: string): Promise<AppError> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const body = await res.json().catch(() => null);
    const code = typeof body?.error === 'string' ? body.error : 'generic';
    const retryAfter = typeof body?.retry_after === 'number' && body.retry_after > 0 ? Math.ceil(body.retry_after) : undefined;
    return new AppError(code, `${name} HTTP ${res.status}${body?.detail ? ` – ${body.detail}` : ''}`, retryAfter);
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

  const { data, error } = await invokeFunction<{ path: string }>(`profile-image?kind=${kind}`, {
    body,
    headers: { 'Content-Type': 'image/jpeg' },
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

// ---------- Notificações ----------

export type NotificationKind = 'like' | 'comment' | 'reply' | 'follow' | 'comment_reply' | 'comment_like' | 'review_like';
export type NotificationFilter = 'all' | 'replies';

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  created_at: string;
  read: boolean;
  actor_id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  post_id: string | null;
  preview_title: string | null;
  preview_image_url: string | null;
  comment_body: string | null;
  /** Curtida em review: o álbum (abre a tela do álbum). */
  review_album_id?: string | null;
}

export async function fetchNotifications(filter: NotificationFilter, before: number | null): Promise<NotificationItem[]> {
  const { data, error } = await supabase.rpc('notifications_list', { p_filter: filter, p_before: before, p_limit: 30 });
  if (error) throw error;
  return (data ?? []) as NotificationItem[];
}

export async function fetchUnreadNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc('notifications_unread_count');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('notifications_mark_read');
  if (error) throw error;
}

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  const { error } = await supabase.rpc('push_token_register', { p_token: token, p_platform: platform });
  if (error) throw error;
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('push_token_unregister', { p_token: token });
  if (error) throw error;
}

// ---------- Vibes (como os Stories: somem em 24 h) ----------

export type VibeKind = 'photo' | 'video' | 'text' | 'music' | 'post';
export const VIBE_STYLES = ['violet', 'blue', 'pink', 'green', 'orange', 'dark'] as const;
export type VibeStyle = (typeof VIBE_STYLES)[number];

/** Limites do vídeo (vibes e posts), iguais aos da Edge Function media-upload. */
export const VIBE_VIDEO_MAX = { seconds: 30, bytes: 30 * 1024 * 1024 };

export interface VibeTrayItem {
  author_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  vibe_count: number;
  unseen: boolean;
  latest_at: string;
  is_me: boolean;
}

export interface Vibe {
  id: string;
  kind: VibeKind;
  media_path: string | null;
  duration_ms: number | null;
  text: string | null;
  style: VibeStyle;
  created_at: string;
  seen: boolean;
  /** Só para o autor. */
  view_count: number | null;
  preview_url: string | null;
  preview_platform: string | null;
  preview_title: string | null;
  preview_artist: string | null;
  preview_image_url: string | null;
  post_id: string | null;
  post_body: string | null;
  post_author_username: string | null;
  post_author_avatar_url: string | null;
  text_x: number | null;
  text_y: number | null;
  preview_audio_url: string | null;
}

export interface VibeViewer {
  username: string;
  display_name: string;
  avatar_url: string | null;
  viewed_at: string;
}

export async function fetchVibesTray(): Promise<VibeTrayItem[]> {
  const { data, error } = await supabase.rpc('vibes_tray');
  if (error) throw error;
  return (data ?? []) as VibeTrayItem[];
}

export async function fetchVibesOf(authorId: string): Promise<Vibe[]> {
  const { data, error } = await supabase.rpc('vibes_of', { p_author: authorId });
  if (error) throw error;
  return (data ?? []) as Vibe[];
}

export async function markVibeSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('vibe_mark_seen', { p_vibe: id });
  if (error) throw error;
}

export async function fetchVibeViewers(id: string): Promise<VibeViewer[]> {
  const { data, error } = await supabase.rpc('vibe_viewers', { p_vibe: id });
  if (error) throw error;
  return (data ?? []) as VibeViewer[];
}

export async function deleteVibe(id: string): Promise<void> {
  const { error } = await supabase.rpc('vibe_delete', { p_vibe: id });
  if (error) throw error;
}

/** URL temporária (1 h) da foto/vídeo: o bucket é privado e só libera vibe ativa e sem bloqueio. */
export async function vibeMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('vibes').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export interface UploadedMedia {
  path: string;
  width: number;
  height: number;
  durationMs?: number;
}

/** Envia a foto (já convertida) ou o vídeo para a Edge Function media-upload, que confere e grava. */
export async function uploadMedia(target: 'vibe' | 'post', type: 'photo' | 'video', bytes: Uint8Array): Promise<UploadedMedia> {
  // ArrayBuffer (não Uint8Array): com Content-Type próprio, o supabase-js transformaria em JSON.
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const { data, error } = await invokeFunction<UploadedMedia>(`media-upload?for=${target}&type=${type}`, {
    body,
    headers: { 'Content-Type': type === 'photo' ? 'image/jpeg' : 'video/mp4' },
  });
  if (error) throw await functionError('media-upload', error, 'generic');
  if (!data?.path) throw new AppError('generic');
  return data;
}

export const uploadVibeMedia = (type: 'photo' | 'video', bytes: Uint8Array) => uploadMedia('vibe', type, bytes);

export interface NewVibe {
  kind: VibeKind;
  mediaPath?: string;
  durationMs?: number;
  text?: string;
  style?: VibeStyle;
  linkPreviewId?: string;
  postId?: string;
  /** Centro do texto em fração da tela (sem isso, o lugar padrão do tipo). */
  textPos?: { x: number; y: number } | null;
}

export async function createVibe(v: NewVibe): Promise<string> {
  const { data, error } = await supabase.rpc('vibe_create', {
    p_kind: v.kind,
    p_media_path: v.mediaPath ?? null,
    p_duration_ms: v.durationMs ?? null,
    p_text: v.text?.trim() ? v.text.trim() : null,
    p_style: v.style ?? 'violet',
    p_link_preview_id: v.linkPreviewId ?? null,
    p_post_id: v.postId ?? null,
    p_text_x: v.text?.trim() && v.textPos ? v.textPos.x : null,
    p_text_y: v.text?.trim() && v.textPos ? v.textPos.y : null,
  });
  if (error) throw error;
  return data as string;
}
