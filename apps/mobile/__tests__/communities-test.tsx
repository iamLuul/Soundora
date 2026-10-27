import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CommunityScreen from '../src/app/c/[slug]/index';
import CommunitiesScreen from '../src/app/communities/index';
import NewCommunityScreen from '../src/app/communities/new';
import { CommunitiesFeed } from '../src/components/communities/CommunitiesFeed';
import { slugFromName } from '../src/components/communities/CommunityForm';
import { PostCard } from '../src/components/PostCard';
import type { Community } from '../src/lib/api';
import i18n from '../src/lib/i18n';
import type { FeedItem } from '../src/lib/types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: Record<string, string> = {};
const mockCommunity = jest.fn();
const mockPosts = jest.fn(async (..._a: unknown[]): Promise<FeedItem[]> => []);
const mockMembers = jest.fn(async (..._a: unknown[]): Promise<unknown[]> => []);
const mockJoin = jest.fn(async (_id: string) => 'active');
const mockRespond = jest.fn(async (..._a: unknown[]) => undefined);
const mockCreate = jest.fn(async (_c: unknown) => 'new-id');
const mockMine = jest.fn(async (): Promise<unknown[]> => []);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => true, back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) },
  supabaseUrl: 'http://x',
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', username: 'raul' }, session: { user: { id: 'me' } } }) }));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchCommunity: (...a: unknown[]) => mockCommunity(...a),
  fetchCommunityPosts: (...a: unknown[]) => mockPosts(...a),
  fetchCommunityMembers: (...a: unknown[]) => mockMembers(...a),
  joinCommunity: (id: string) => mockJoin(id),
  respondCommunityRequest: (...a: unknown[]) => mockRespond(...a),
  createCommunity: (c: unknown) => mockCreate(c),
  fetchMyCommunities: () => mockMine(),
  fetchRecommendedCommunities: async () => [],
  searchCommunities: async () => [{ id: 'c9', slug: 'achada', name: 'Comunidade Achada', visibility: 'open', color: 2, member_count: 7 }],
  fetchFollowingIds: async () => [],
  fetchMyFollowingIds: async () => new Set(),
}));

const community = (over: Partial<Community> = {}): Community => ({
  id: 'c1',
  slug: 'fas',
  name: 'Fãs da Banda',
  description: 'Para quem ama a banda',
  visibility: 'open',
  color: 0,
  artists: ['Arctic Monkeys'],
  genres: [],
  member_count: 12,
  created_at: new Date().toISOString(),
  my_role: null,
  my_status: null,
  can_view: true,
  pending_count: null,
  ...over,
});
const post = (id: string, over: Partial<FeedItem> = {}): FeedItem =>
  ({
    id,
    body: `post ${id}`,
    genre: null,
    like_count: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
    liked_by_me: false,
    author_id: 'u2',
    author_username: 'bia',
    author_display_name: 'Bia',
    author_avatar_url: null,
    preview_url: null,
    preview_platform: null,
    preview_kind: null,
    preview_title: null,
    preview_artist: null,
    preview_image_url: null,
    score: 0,
    genres: [],
    media: [],
    post_type: 'text',
    community: { id: 'c1', slug: 'fas', name: 'Fãs da Banda', color: 0, closed: false },
    ...over,
  }) as FeedItem;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  await i18n.changeLanguage('pt-BR');
});

describe('Comunidade', () => {
  test('aberta: mostra os posts para quem é de fora e deixa entrar', async () => {
    Object.assign(mockParams, { slug: 'fas' });
    mockCommunity.mockResolvedValue(community());
    mockPosts.mockResolvedValue([post('p1')]);
    await wrap(<CommunityScreen />);
    expect(await screen.findByText('Fãs da Banda')).toBeTruthy();
    expect(screen.getByText('12 membros · Aberta')).toBeTruthy();
    expect(await screen.findByText('post p1')).toBeTruthy();
    // Na página da comunidade não repete o cartão "post da comunidade".
    expect(screen.queryByTestId('post-community-p1')).toBeNull();
    await fireEvent.press(screen.getByTestId('community-join'));
    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith('c1'));
  });

  test('fechada: posts trancados para quem não é membro; botão de pedir para entrar', async () => {
    Object.assign(mockParams, { slug: 'fas' });
    mockCommunity.mockResolvedValue(community({ visibility: 'closed', can_view: false }));
    await wrap(<CommunityScreen />);
    expect(await screen.findByTestId('community-locked')).toBeTruthy();
    expect(screen.getByText('Pedir para entrar')).toBeTruthy();
    expect(mockPosts).not.toHaveBeenCalled();
  });

  test('moderador vê os pedidos e aceita', async () => {
    Object.assign(mockParams, { slug: 'fas' });
    mockCommunity.mockResolvedValue(community({ visibility: 'closed', my_role: 'moderator', my_status: 'active', pending_count: 1 }));
    mockMembers.mockImplementation(async (_id, status) =>
      status === 'pending' ? [{ user_id: 'u5', username: 'duda', display_name: 'Duda', avatar_url: null, role: 'member', status: 'pending', since: '' }] : [],
    );
    await wrap(<CommunityScreen />);
    await fireEvent.press(await screen.findByTestId('tab-requests'));
    await fireEvent.press(await screen.findByTestId('accept-duda'));
    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith('c1', 'u5', true));
  });

  test('não existe: 404', async () => {
    Object.assign(mockParams, { slug: 'nada' });
    mockCommunity.mockResolvedValue(null);
    await wrap(<CommunityScreen />);
    expect(await screen.findByText('Página não encontrada')).toBeTruthy();
  });
});

describe('Aba Comunidades', () => {
  test('sem comunidades: convite para explorar', async () => {
    mockMine.mockResolvedValue([]);
    await wrap(<CommunitiesFeed active />);
    expect(await screen.findByTestId('communities-empty')).toBeTruthy();
  });

  test('tudo misturado ou filtrar por uma comunidade', async () => {
    mockMine.mockResolvedValue([
      { id: 'c1', slug: 'fas', name: 'Fãs da Banda', color: 0, visibility: 'open', role: 'member', member_count: 3 },
      { id: 'c2', slug: 'jazz', name: 'Jazz Club', color: 1, visibility: 'closed', role: 'owner', member_count: 9 },
    ]);
    mockPosts.mockResolvedValue([post('p1')]);
    await wrap(<CommunitiesFeed active />);
    expect(await screen.findByText('post p1')).toBeTruthy();
    expect(mockPosts).toHaveBeenCalledWith(null, null);
    // O cartão "post da comunidade X postado por @Y".
    expect(screen.getByText(/postado por @bia/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('community-filter-jazz'));
    await waitFor(() => expect(mockPosts).toHaveBeenCalledWith('c2', null));
  });
});

describe('Explorar e criar', () => {
  test('buscar comunidade', async () => {
    mockMine.mockResolvedValue([]);
    await wrap(<CommunitiesScreen />);
    await fireEvent.changeText(screen.getByTestId('community-search'), 'achada');
    expect(await screen.findByText('Comunidade Achada')).toBeTruthy();
  });

  test('criar: @ sugerido pelo nome, artistas e fechada', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await wrap(<NewCommunityScreen />);
    await fireEvent.changeText(screen.getByTestId('community-name'), 'Fãs do Arctic Monkeys!');
    expect(screen.getByTestId('community-slug').props.value).toBe('fas_do_arctic_monkeys');
    await fireEvent.changeText(screen.getByTestId('community-artist'), 'Arctic Monkeys');
    await fireEvent.press(screen.getByTestId('community-artist-add'));
    await fireEvent.press(screen.getByTestId('community-visibility-closed'));
    await fireEvent.press(screen.getByTestId('community-color-3'));
    await fireEvent.press(screen.getByTestId('community-submit'));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'fas_do_arctic_monkeys', name: 'Fãs do Arctic Monkeys!', visibility: 'closed', artists: ['Arctic Monkeys'], color: 3 }),
      ),
    );
    expect(mockReplace).toHaveBeenCalledWith('/c/fas_do_arctic_monkeys');
  });

  test('slug a partir do nome', () => {
    expect(slugFromName('  Clube do Forró — 2026 ')).toBe('clube_do_forro_2026');
  });
});

describe('Post de comunidade', () => {
  test('cartão com a comunidade e quem postou; tocar abre a comunidade', async () => {
    await wrap(<PostCard item={post('p7')} onToggleLike={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('post-community-p7'));
    expect(mockPush).toHaveBeenCalledWith('/c/fas');
  });
});
