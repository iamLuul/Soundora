// Posts: criar, abrir, apagar, curtir, comentar e os feeds (Para você, Seguindo, gênero, busca, perfil).
import { commentSchema, postTextSchema } from '@soundhora/core';
import { AppError } from '../errors';
import { supabase } from '../supabase';
import type { CommentRow, FeedItem, LinkPreviewRow } from '../types';
import { currentUserId, functionError, invokeFunction } from './client';

export const FEED_PAGE_SIZE = 20;

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
export async function createPost(input: {
  body: string;
  previewId?: string | null;
  genres?: string[];
  media?: NewPostMedia[];
  /** Post de comunidade (só aparece nela e na aba Comunidades). */
  communityId?: string | null;
}): Promise<string> {
  const parsed = postTextSchema.safeParse(input.body);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? 'generic');
  const { data, error } = await supabase.rpc('post_create', {
    p_body: parsed.data,
    p_link_preview_id: input.previewId ?? null,
    p_genres: input.genres ?? [],
    p_media: input.media ?? [],
    p_community: input.communityId ?? null,
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

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

/**
 * Uma página do feed. `openedAt` é o instante em que a pessoa abriu o feed: todas as páginas
 * usam o mesmo, então a ordem não muda no meio da rolagem (sem posts repetidos ou pulados).
 */
/** Para você: página `page` da abertura feita em `openedAt`; `seen` (já vistos) vão para o fim. */
export async function fetchFeed(page: number, openedAt: string, seen: string[] = []): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('feed_for_you', {
    p_limit: FEED_PAGE_SIZE,
    p_offset: page * FEED_PAGE_SIZE,
    p_now: openedAt,
    p_seen: seen.slice(0, 500),
  });
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

export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const userId = await currentUserId();
  const { error } = liked
    ? await supabase.from('likes').insert({ user_id: userId, post_id: postId })
    : await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
  // 23505 = já curtido (duplo toque); não é erro para quem usa.
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
