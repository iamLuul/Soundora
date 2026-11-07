// Reviews de álbuns: buscar álbum, escrever, curtir, apagar e o ranking.
import { AppError } from '../errors';
import { supabase } from '../supabase';
import { currentUserId, functionError, invokeFunction } from './client';

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

/** Reviews populares para o Para você (pelo gosto da pessoa; uma por álbum, sem as que já curtiu). */
export async function fetchReviewsForYou(openedAt: string | null = null, limit = 20): Promise<AlbumReview[]> {
  const { data, error } = await supabase.rpc('feed_reviews_for_you', { p_limit: limit, p_now: openedAt });
  if (error) throw error;
  return ((data ?? []) as AlbumReview[]).map((r) => ({ ...r, rating: Number(r.rating) }));
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

/** Aba Seguindo: reviews de quem eu sigo (e as minhas), da mais nova à mais velha. */
export async function fetchFollowingReviews(before: ReviewCursor | null): Promise<AlbumReview[]> {
  const { data, error } = await supabase.rpc('reviews_following', {
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: REVIEWS_PAGE,
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
