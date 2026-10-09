import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { FEED_PAGE_SIZE, fetchFeed, fetchProfilePosts, setLiked } from './api';
import type { FeedItem } from './types';

export const keys = {
  feed: ['feed'] as const,
  profilePosts: (authorId: string) => ['profile-posts', authorId] as const,
  profile: (username: string) => ['profile', username] as const,
  comments: (postId: string) => ['comments', postId] as const,
};

export function useFeed() {
  return useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam }) => fetchFeed(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === FEED_PAGE_SIZE ? pages.length : undefined),
  });
}

export function useProfilePosts(authorId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.profilePosts(authorId ?? ''),
    enabled: !!authorId,
    queryFn: ({ pageParam }) => fetchProfilePosts(authorId!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length === FEED_PAGE_SIZE ? (last[last.length - 1]?.created_at ?? undefined) : undefined),
  });
}

/** Aplica uma mudança num post em todas as listas em cache. */
export function patchPostInCache(data: InfiniteData<FeedItem[]> | undefined, postId: string, patch: (p: FeedItem) => FeedItem) {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => page.map((p) => (p.id === postId ? patch(p) : p))) };
}

export function toggleLikePatch(p: FeedItem): FeedItem {
  return { ...p, liked_by_me: !p.liked_by_me, like_count: Math.max(0, p.like_count + (p.liked_by_me ? -1 : 1)) };
}

/** Curtir/descurtir com atualização otimista (a tela muda antes da resposta do servidor). */
export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: FeedItem) => setLiked(item.id, !item.liked_by_me),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: keys.feed });
      const lists = qc.getQueriesData<InfiniteData<FeedItem[]>>({ predicate: (q) => ['feed', 'profile-posts'].includes(String(q.queryKey[0])) });
      for (const [key, data] of lists) qc.setQueryData(key, patchPostInCache(data, item.id, toggleLikePatch));
      return { lists };
    },
    onError: (_err, _item, ctx) => {
      for (const [key, data] of ctx?.lists ?? []) qc.setQueryData(key, data);
    },
  });
}
