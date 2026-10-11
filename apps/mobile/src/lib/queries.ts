import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  FEED_PAGE_SIZE,
  fetchFeed,
  fetchNotifications,
  fetchProfilePosts,
  fetchUnreadNotifications,
  fetchVibesOf,
  fetchVibesTray,
  vibeMediaUrl,
  setLiked,
  type NotificationFilter,
  type PostCursor,
} from './api';
import { supabase } from './supabase';
import type { FeedItem } from './types';

export const keys = {
  feed: ['feed'] as const,
  profilePosts: (authorId: string) => ['profile-posts', authorId] as const,
  profile: (username: string) => ['profile', username] as const,
  comments: (postId: string) => ['comments', postId] as const,
  notifications: (filter: string) => ['notifications', filter] as const,
  unread: ['notifications-unread'] as const,
  vibesTray: ['vibes', 'tray'] as const,
  vibesOf: (authorId: string) => ['vibes', 'of', authorId] as const,
};

/** Quem tem vibe ativa (eu + quem eu sigo). */
export function useVibesTray(enabled = true) {
  return useQuery({ queryKey: keys.vibesTray, queryFn: fetchVibesTray, enabled, refetchInterval: 60_000, staleTime: 15_000 });
}

export function useVibesOf(authorId: string) {
  return useQuery({ queryKey: keys.vibesOf(authorId), queryFn: () => fetchVibesOf(authorId), staleTime: 0 });
}

/** URL assinada da mídia (vale 1 h; renova antes). */
export function useVibeMedia(path: string | null) {
  return useQuery({ queryKey: ['vibe-media', path], queryFn: () => vibeMediaUrl(path!), enabled: !!path, staleTime: 50 * 60_000 });
}

/** Quantas notificações não lidas (bolinha no sino). Atualiza a cada minuto e ao voltar para o app. */
export function useUnreadNotifications(enabled = true) {
  return useQuery({
    queryKey: keys.unread,
    queryFn: fetchUnreadNotifications,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useNotifications(filter: NotificationFilter) {
  return useInfiniteQuery({
    queryKey: keys.notifications(filter),
    queryFn: ({ pageParam }: { pageParam: number | null }) => fetchNotifications(filter, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length < 30 ? undefined : last[last.length - 1]!.id),
  });
}

interface FeedPage {
  page: number;
  /** Instante em que o feed foi aberto (null na primeira página: usa o agora). */
  openedAt: string | null;
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: async ({ pageParam }: { pageParam: FeedPage }) => {
      const openedAt = pageParam.openedAt ?? new Date().toISOString();
      return { items: await fetchFeed(pageParam.page, openedAt), openedAt };
    },
    initialPageParam: { page: 0, openedAt: null } as FeedPage,
    getNextPageParam: (last, pages) =>
      last.items.length === FEED_PAGE_SIZE ? { page: pages.length, openedAt: last.openedAt } : undefined,
    // Telas recebem só a lista de posts, sem repetidos (por segurança, caso o servidor repita).
    select: (data) => ({ ...data, pages: dedupePages(data.pages.map((p) => p.items)) }),
  });
}

/** Tira posts repetidos entre páginas (mantém a primeira ocorrência). */
export function dedupePages(pages: FeedItem[][]): FeedItem[][] {
  const seen = new Set<string>();
  return pages.map((page) =>
    page.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }),
  );
}

export function useProfilePosts(authorId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.profilePosts(authorId ?? ''),
    enabled: !!authorId,
    queryFn: ({ pageParam }) => fetchProfilePosts(authorId!, pageParam),
    initialPageParam: null as PostCursor | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE_SIZE && tail ? { createdAt: tail.created_at, id: tail.id } : undefined;
    },
  });
}

/** Página em cache: lista de posts (perfil) ou { items, openedAt } (feed). */
type CachedPage = FeedItem[] | { items: FeedItem[]; openedAt: string };

/** Aplica uma mudança num post em todas as listas em cache. */
export function patchPostInCache<P extends CachedPage>(data: InfiniteData<P> | undefined, postId: string, patch: (p: FeedItem) => FeedItem) {
  if (!data) return data;
  const fix = (items: FeedItem[]) => items.map((p) => (p.id === postId ? patch(p) : p));
  return { ...data, pages: data.pages.map((page) => (Array.isArray(page) ? fix(page) : { ...page, items: fix(page.items) }) as P) };
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
      await qc.cancelQueries({ queryKey: ['profile-posts'] });
      const lists = qc.getQueriesData<InfiniteData<CachedPage>>({ predicate: (q) => ['feed', 'profile-posts'].includes(String(q.queryKey[0])) });
      for (const [key, data] of lists) qc.setQueryData(key, patchPostInCache(data, item.id, toggleLikePatch));
      return { lists };
    },
    onError: (_err, _item, ctx) => {
      for (const [key, data] of ctx?.lists ?? []) qc.setQueryData(key, data);
    },
  });
}

export interface GenreRow {
  slug: string;
  name_pt: string;
  name_en: string;
}

/** Lista de gêneros (tabela genres), usada no onboarding, no Em alta e nos cartões. */
export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('genres').select('slug, name_pt, name_en').order('name_pt');
      if (error) throw error;
      return data as GenreRow[];
    },
  });
}

export function genreLabel(genres: GenreRow[] | undefined, slug: string | null, locale: string): string | null {
  if (!slug) return null;
  const g = genres?.find((x) => x.slug === slug);
  if (!g) return slug.replace(/_/g, ' ');
  return locale === 'pt-BR' ? g.name_pt : g.name_en;
}
