import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import {
  getStreamingPlatform,
  FEED_PAGE_SIZE,
  fetchFeed,
  fetchReviewsForYou,
  fetchFollowingFeed,
  fetchGenrePosts,
  searchPosts,
  fetchMyFollowingIds,
  fetchSuggestedAccounts,
  setFollowing,
  fetchRequestedIds,
  fetchProfileLikedSongs,
  LIKED_SONGS_PAGE,
  fetchNotifications,
  fetchPeople,
  fetchPost,
  PEOPLE_PAGE,
  fetchProfilePosts,
  fetchUnreadNotifications,
  fetchVibesOf,
  fetchVibesTray,
  fetchCommunity,
  fetchCommunityPosts,
  fetchMyCommunities,
  fetchRecommendedCommunities,
  DM_PAGE,
  fetchDmConversation,
  fetchDmInbox,
  fetchDmMessages,
  fetchDmUnread,
  vibeMediaUrl,
  setLiked,
  type NotificationFilter,
  type PostCursor,
} from './api';
import { useDebouncedValue } from './hooks';
import { seenSnapshot } from './seen-posts';
import { supabase } from './supabase';
import type { FeedItem } from './types';

export const keys = {
  feed: ['feed'] as const,
  followingFeed: ['feed-following'] as const,
  genrePosts: (slug: string) => ['genre-posts', slug] as const,
  followingIds: ['following-ids'] as const,
  /** Contas privadas para as quais pedi para seguir. */
  requestedIds: ['requested-ids'] as const,
  /** Pedidos para seguir que eu recebi. */
  followRequests: ['follow-requests'] as const,
  suggested: ['suggested-accounts'] as const,
  reviewsForYou: ['reviews-for-you'] as const,
  profilePosts: (authorId: string) => ['profile-posts', authorId] as const,
  profile: (username: string) => ['profile', username] as const,
  comments: (postId: string) => ['comments', postId] as const,
  post: (postId: string) => ['post', postId] as const,
  likedSongs: (userId: string) => ['liked-songs', userId] as const,
  people: (username: string, list: string) => ['people', username, list] as const,
  notifications: (filter: string) => ['notifications', filter] as const,
  unread: ['notifications-unread'] as const,
  vibesTray: ['vibes', 'tray'] as const,
  vibesOf: (authorId: string) => ['vibes', 'of', authorId] as const,
  streamingPlatform: ['streaming-platform'] as const,
  worldChart: (period: string) => ['world-chart', period] as const,
  /** Mensagens diretas (tudo começa com 'dm': o aviso ao vivo atualiza tudo de uma vez). */
  dmInbox: (requests: boolean) => ['dm', 'inbox', requests] as const,
  dmUnread: ['dm', 'unread'] as const,
  dmConversation: (id: string) => ['dm', 'conversation', id] as const,
  dmMessages: (id: string) => ['dm', 'messages', id] as const,
  /** Comunidades (tudo começa com 'communities' para atualizar junto depois de entrar/sair). */
  community: (slug: string) => ['communities', 'one', slug] as const,
  communityPosts: (id: string | null) => ['communities', 'posts', id ?? 'all'] as const,
  myCommunities: ['communities', 'mine'] as const,
  recommendedCommunities: ['communities', 'recommended'] as const,
};

export function useCommunity(slug: string) {
  return useQuery({ queryKey: keys.community(slug), queryFn: () => fetchCommunity(slug), enabled: !!slug });
}

export function useMyCommunities(enabled = true) {
  return useQuery({ queryKey: keys.myCommunities, queryFn: fetchMyCommunities, enabled, staleTime: 60_000 });
}

export function useRecommendedCommunities(enabled = true) {
  return useQuery({ queryKey: keys.recommendedCommunities, queryFn: () => fetchRecommendedCommunities(8), enabled, staleTime: 10 * 60_000 });
}

/** Posts de uma comunidade, ou de todas as minhas (null). */
export function useCommunityPosts(id: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.communityPosts(id),
    enabled,
    queryFn: ({ pageParam }) => fetchCommunityPosts(id, pageParam),
    initialPageParam: null as PostCursor | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE_SIZE && tail ? { createdAt: tail.created_at, id: tail.id } : undefined;
    },
  });
}

/** Conversas (ou pedidos), da mais recente para a mais antiga. */
export function useDmInbox(requests: boolean) {
  return useInfiniteQuery({
    queryKey: keys.dmInbox(requests),
    queryFn: ({ pageParam }) => fetchDmInbox(requests, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length < 30 ? undefined : last[last.length - 1]!.last_at),
  });
}

/** Bolinha do ícone de mensagens. Atualiza ao vivo (aviso 'dm'), a cada minuto e ao voltar para o app. */
export function useDmUnread(enabled = true) {
  return useQuery({ queryKey: keys.dmUnread, queryFn: fetchDmUnread, enabled, refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 10_000 });
}

export function useDmConversation(id: string | null) {
  return useQuery({ queryKey: keys.dmConversation(id ?? ''), queryFn: () => fetchDmConversation(id!), enabled: !!id });
}

/** Mensagens de uma conversa, da mais nova para a mais antiga (a lista é invertida na tela). */
export function useDmMessages(id: string | null) {
  return useInfiniteQuery({
    queryKey: keys.dmMessages(id ?? ''),
    queryFn: ({ pageParam }) => fetchDmMessages(id!, pageParam),
    enabled: !!id,
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length < DM_PAGE ? undefined : last[last.length - 1]!.id),
  });
}

/** Plataforma de streaming da pessoa (null = ainda não escolheu). */
export function useStreamingPlatform(enabled = true) {
  return useQuery({ queryKey: keys.streamingPlatform, queryFn: getStreamingPlatform, enabled, staleTime: Infinity });
}

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
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
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
  /** Posts já vistos no momento da abertura (null: pega agora). Fixo em todas as páginas dela. */
  seen: string[] | null;
}

interface FeedPageData {
  items: FeedItem[];
  openedAt: string;
  seen: string[];
}

async function loadFeedPage(param: FeedPage): Promise<FeedPageData> {
  const openedAt = param.openedAt ?? new Date().toISOString();
  const seen = param.seen ?? seenSnapshot();
  return { items: await fetchFeed(param.page, openedAt, seen), openedAt, seen };
}

/**
 * Para você. Cada abertura (instante + posts já vistos) tem a sua ordem; as páginas seguintes
 * usam a mesma abertura. Para conteúdo novo, renewFeed abre de novo.
 */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam }: { pageParam: FeedPage }) => loadFeedPage(pageParam),
    initialPageParam: { page: 0, openedAt: null, seen: null } as FeedPage,
    getNextPageParam: (last, pages) => (last.items.length === FEED_PAGE_SIZE ? { page: pages.length, openedAt: last.openedAt, seen: last.seen } : undefined),
    // Telas recebem só a lista de posts, sem repetidos (por segurança, caso o servidor repita).
    select: (data) => ({ ...data, pages: dedupePages(data.pages.map((p) => p.items)) }),
  });
}

/**
 * Abre o Para você de novo (agora, sem o que já foi visto): troca a lista inteira pela primeira
 * página da nova abertura, sem esvaziar a tela enquanto carrega. Também busca reviews de novo.
 */
export async function renewFeed(qc: QueryClient): Promise<void> {
  const param: FeedPage = { page: 0, openedAt: new Date().toISOString(), seen: seenSnapshot() };
  void qc.invalidateQueries({ queryKey: keys.reviewsForYou });
  await qc.cancelQueries({ queryKey: keys.feed, exact: true });
  const first = await loadFeedPage(param);
  qc.setQueryData<InfiniteData<FeedPageData, FeedPage>>(keys.feed, { pages: [first], pageParams: [param] });
}

/** Reviews populares do gosto da pessoa, para as faixas do Para você. */
export function useReviewsForYou(enabled = true) {
  return useQuery({ queryKey: keys.reviewsForYou, queryFn: () => fetchReviewsForYou(), enabled, staleTime: 5 * 60_000 });
}

/** Aba Seguindo: rolagem infinita por data (cursor = último post da página). */
export function useFollowingFeed(enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.followingFeed,
    enabled,
    queryFn: ({ pageParam }) => fetchFollowingFeed(pageParam),
    initialPageParam: null as PostCursor | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE_SIZE && tail ? { createdAt: tail.created_at, id: tail.id } : undefined;
    },
  });
}

/** Posts marcados com um gênero (Buscar › gênero). */
export function useGenrePosts(slug: string) {
  return useInfiniteQuery({
    queryKey: keys.genrePosts(slug),
    enabled: !!slug,
    queryFn: ({ pageParam }) => fetchGenrePosts(slug, pageParam),
    initialPageParam: null as PostCursor | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE_SIZE && tail ? { createdAt: tail.created_at, id: tail.id } : undefined;
    },
  });
}

/** Posts cujo texto contém a palavra (Buscar, quando não é pessoa, música nem gênero). */
export function useSearchPosts(query: string) {
  return useInfiniteQuery({
    queryKey: ['search-posts', query],
    enabled: query.length >= 2,
    queryFn: ({ pageParam }) => searchPosts(query, pageParam),
    initialPageParam: null as PostCursor | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === FEED_PAGE_SIZE && tail ? { createdAt: tail.created_at, id: tail.id } : undefined;
    },
  });
}

/** Um gênero pelo slug (nome em português e inglês), para o título da tela. */
export function useGenre(slug: string) {
  return useQuery({
    queryKey: ['genre', slug],
    enabled: !!slug,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('genres').select('slug, name_pt, name_en').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data as GenreRow | null;
    },
  });
}

/** Contas para seguir, pelo gosto (gêneros, curtidas) e por quem eu já sigo. */
export function useSuggestedAccounts(enabled = true) {
  return useQuery({ queryKey: keys.suggested, queryFn: () => fetchSuggestedAccounts(), enabled, staleTime: 5 * 60_000 });
}

/** Quem eu sigo, como conjunto de ids. */
export function useFollowingIds(enabled = true) {
  return useQuery({
    queryKey: keys.followingIds,
    queryFn: async () => new Set(await fetchMyFollowingIds()),
    enabled,
    staleTime: 60_000,
  });
}

/** Contas privadas para as quais pedi para seguir (o botão mostra "Solicitado"). */
export function useRequestedIds(enabled = true) {
  return useQuery({ queryKey: keys.requestedIds, queryFn: fetchRequestedIds, enabled });
}

/**
 * Seguir/deixar de seguir com atualização otimista: o botão muda na hora. Depois atualiza o
 * que depende disso (aba Seguindo, perfis, listas de seguidores, fila de vibes). O Para você
 * não é recarregado (os posts não pulam de lugar enquanto a pessoa lê).
 */
export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) => setFollowing(userId, follow),
    onMutate: async ({ userId, follow }) => {
      await qc.cancelQueries({ queryKey: keys.followingIds });
      const before = qc.getQueryData<Set<string>>(keys.followingIds);
      const next = new Set(before ?? []);
      if (follow) next.add(userId);
      else next.delete(userId);
      qc.setQueryData(keys.followingIds, next);
      return { before };
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(keys.followingIds, ctx?.before),
    // Conta privada: não segue ainda, vira "Solicitado".
    onSuccess: (status, { userId }) => {
      const requested = new Set(qc.getQueryData<Set<string>>(keys.requestedIds) ?? []);
      if (status === 'requested') {
        const following = new Set(qc.getQueryData<Set<string>>(keys.followingIds) ?? []);
        following.delete(userId);
        qc.setQueryData(keys.followingIds, following);
        requested.add(userId);
      } else requested.delete(userId);
      qc.setQueryData(keys.requestedIds, requested);
    },
    onSettled: () => {
      for (const queryKey of [keys.followingFeed, keys.vibesTray, ['profile'], ['people'], ['following']]) void qc.invalidateQueries({ queryKey });
    },
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
      await qc.cancelQueries({ queryKey: keys.followingFeed });
      const lists = qc.getQueriesData<InfiniteData<CachedPage>>({
        predicate: (q) => ['feed', 'feed-following', 'genre-posts', 'search-posts', 'profile-posts', 'liked-posts'].includes(String(q.queryKey[0])),
      });
      for (const [key, data] of lists) qc.setQueryData(key, patchPostInCache(data, item.id, toggleLikePatch));
      // O post aberto em tela cheia.
      const single = qc.getQueryData<FeedItem | null>(keys.post(item.id));
      if (single) qc.setQueryData(keys.post(item.id), toggleLikePatch(single));
      return { lists, single };
    },
    onError: (_err, item, ctx) => {
      for (const [key, data] of ctx?.lists ?? []) qc.setQueryData(key, data);
      if (ctx?.single) qc.setQueryData(keys.post(item.id), ctx.single);
    },
  });
}

export interface GenreRow {
  slug: string;
  name_pt: string;
  name_en: string;
}

/**
 * Gêneros em destaque (os que aparecem sem pesquisar, com nome em português). O catálogo
 * completo tem milhares: esses o app não baixa, pesquisa com useGenreSearch.
 */
export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('genres').select('slug, name_pt, name_en').eq('featured', true).order('name_pt');
      if (error) throw error;
      return data as GenreRow[];
    },
  });
}

/** Pesquisa no catálogo inteiro de gêneros (no servidor), com uma pausa enquanto digita. */
export function useGenreSearch(query: string, limit = 20) {
  const q = useDebouncedValue(
    query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
    250,
  );
  return useQuery({
    queryKey: ['genre-search', q, limit],
    enabled: q.length >= 1,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_genres', { p_query: q, p_limit: limit });
      if (error) throw error;
      return data as GenreRow[];
    },
  });
}

/** Nome do gênero para mostrar: o da tabela (destaques) ou o próprio slug arrumado ("dance_pop" → "Dance Pop"). */
export function prettyGenre(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

export function genreLabel(genres: GenreRow[] | undefined, slug: string | null, locale: string): string | null {
  if (!slug) return null;
  const g = genres?.find((x) => x.slug === slug);
  if (!g) return prettyGenre(slug);
  return locale === 'pt-BR' ? g.name_pt : g.name_en;
}

/** Um post aberto em tela cheia. */
export function usePost(id: string) {
  return useQuery({ queryKey: keys.post(id), queryFn: () => fetchPost(id) });
}

/** Posts que a pessoa curtiu (rolagem infinita). */
/** Músicas curtidas no Descobrir de uma pessoa (perfil › Curtidas), rolagem infinita. */
export function useProfileLikedSongs(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.likedSongs(userId ?? ''),
    enabled: !!userId,
    queryFn: async ({ pageParam }: { pageParam: { liked_at: string; link_preview_id: string } | null }) => fetchProfileLikedSongs(userId!, pageParam),
    initialPageParam: null as { liked_at: string; link_preview_id: string } | null,
    getNextPageParam: (last) =>
      last.length < LIKED_SONGS_PAGE ? undefined : { liked_at: last[last.length - 1]!.liked_at, link_preview_id: last[last.length - 1]!.link_preview_id },
  });
}

/** Seguidores ou seguindo (rolagem infinita). */
export function usePeople(username: string, list: 'followers' | 'following') {
  return useInfiniteQuery({
    queryKey: keys.people(username, list),
    queryFn: ({ pageParam }: { pageParam: number }) => fetchPeople(username, list, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PEOPLE_PAGE ? undefined : all.length),
  });
}
