// Todas as chaves do cache (React Query) num lugar só. Consulta nova: crie a chave aqui e use
// `keys.x` na tela (nunca ['x'] escrito à mão: um erro de digitação faz a tela não atualizar,
// sem nenhum aviso). Chaves que começam igual se atualizam juntas: invalidar ['communities']
// refaz todas as consultas de comunidades.
import type { ReportStatus, UserFilter, UserSort } from './admin';
import type { ReviewFilter } from './reviews';

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
  // ---- até aqui as originais; abaixo as que estavam escritas à mão nas telas.
  /** Prefixos: invalidar um deles atualiza todas as consultas que começam com ele. */
  feedAll: ['feed'] as const,
  profiles: ['profile'] as const,
  profilePostsAll: ['profile-posts'] as const,
  likedSongsAll: ['liked-songs'] as const,
  dm: ['dm'] as const,
  vibes: ['vibes'] as const,
  communities: ['communities'] as const,
  communityPostsAll: ['communities', 'posts'] as const,
  communitySearch: (q: string) => ['communities', 'search', q] as const,
  communityMembers: (id: string, status: string) => ['communities', 'members', id, status] as const,
  communitySlug: (slug: string) => ['community-slug', slug] as const,
  notificationsAll: ['notifications'] as const,
  appConfig: ['app-config'] as const,
  myAccount: ['my-account'] as const,
  myGenres: ['my-genres'] as const,
  myMusic: (tab: string) => ['my-music', tab] as const,
  identities: ['identities'] as const,
  blocked: ['blocked'] as const,
  mutedAccounts: ['muted-accounts'] as const,
  muted: (userId: string) => ['muted', userId] as const,
  verifiedUsernames: ['verified-usernames'] as const,
  usernameAvailable: (username: string) => ['username-available', username] as const,
  searchPeopleAll: ['search-people'] as const,
  searchPeople: (q: string) => ['search-people', q] as const,
  searchTracks: (q: string) => ['search-tracks', q] as const,
  searchGenrePosts: (q: string) => ['search-genres-posts', q] as const,
  searchPosts: (q: string) => ['search-posts', q] as const,
  songSearch: (q: string) => ['song-search', q] as const,
  albumSearch: (q: string) => ['album-search', q] as const,
  albumLink: (url: string | null) => ['album-link', url] as const,
  topAlbums: ['top-albums'] as const,
  albumSummaryAll: ['album-summary'] as const,
  albumSummary: (id: string) => ['album-summary', id] as const,
  discoverLiked: ['discover-liked'] as const,
  discoverDeckAll: ['discover-deck'] as const,
  discoverDeck: (genre: string | null) => ['discover-deck', genre] as const,
  genre: (slug: string) => ['genre', slug] as const,
  genres: ['genres'] as const,
  genreSearch: (q: string, limit: number) => ['genre-search', q, limit] as const,
  postMedia: (paths: string[]) => ['post-media', ...paths] as const,
  vibeMedia: (path: string | null) => ['vibe-media', path] as const,
  vibeViewers: (vibeId: string | null) => ['vibe-viewers', vibeId] as const,
  admin: ['admin'] as const,
  profileBadgesAll: ['profile-badges'] as const,
  userGenresAll: ['user-genres'] as const,
};

export const adminKeys = {
  isAdmin: ['is-admin'] as const,
  overview: ['admin', 'overview'] as const,
  reports: (status: ReportStatus) => ['admin', 'reports', status] as const,
  users: (q: string, filter: UserFilter, sort: UserSort) => ['admin', 'users', q, filter, sort] as const,
  featured: ['admin', 'featured'] as const,
  badges: ['admin', 'badges'] as const,
  badgeHolders: (badgeId: string) => ['admin', 'badges', badgeId, 'holders'] as const,
};

export const reviewKeys = {
  all: ['reviews'] as const,
  list: (f: ReviewFilter = {}) => ['reviews', f.author ?? '', f.album ?? ''] as const,
  /** Dentro de "reviews": curtir e apagar já atualizam esta lista também. */
  following: ['reviews', 'following'] as const,
};

export const badgeKeys = {
  of: (userId: string) => ['profile-badges', userId] as const,
  supportUrl: ['support-url'] as const,
};

export const profileKeys = {
  favorites: (userId: string) => ['favorite-songs', userId] as const,
  genres: (userId: string) => ['user-genres', userId] as const,
};
