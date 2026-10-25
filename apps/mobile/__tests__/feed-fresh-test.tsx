// Para você sempre renovado: voltar para o Início de outra aba abre o feed de novo, sem o que já foi visto.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import FeedScreen from '../src/app/(tabs)/index';
import i18n from '../src/lib/i18n';
import { markSeen, resetSeenForTests, seenSnapshot } from '../src/lib/seen-posts';
import { onTabFocus, resetTabFocusForTests } from '../src/lib/tab-focus';
import type { FeedItem } from '../src/lib/types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: jest.fn() },
  useFocusEffect: () => undefined,
}));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));

function post(id: string): FeedItem {
  return {
    id, body: `post ${id}`, genre: null, like_count: 0, comment_count: 0, created_at: new Date().toISOString(), liked_by_me: false,
    author_id: 'other', author_username: 'outra', author_display_name: 'Outra', author_avatar_url: null,
    preview_url: null, preview_platform: null, preview_kind: null, preview_title: null, preview_artist: null, preview_image_url: null,
    score: 1, genres: [], media: [], post_type: 'text',
  } as unknown as FeedItem;
}

let mockOpening = 0;
const mockFetchFeed = jest.fn(async (_page: number, _openedAt: string, _seen: string[]) => {
  mockOpening += 1;
  return [post(`a${mockOpening}`), post(`b${mockOpening}`)];
});
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchFeed: (page: number, openedAt: string, seen: string[]) => mockFetchFeed(page, openedAt, seen),
  fetchReviewsForYou: async () => [],
  fetchMyFollowingIds: async () => [],
  fetchSuggestedAccounts: async () => [],
  fetchVibesTray: async () => [],
  fetchUnreadNotifications: async () => 0,
}));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
  mockOpening = 0;
  resetSeenForTests();
  resetTabFocusForTests();
});

async function renderFeed() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <FeedScreen />
    </QueryClientProvider>,
  );
  onTabFocus('index');
}

test('vistos: guarda os mais recentes primeiro, sem repetir', () => {
  markSeen(['p1', 'p2']);
  markSeen(['p1']);
  expect(seenSnapshot()).toEqual(['p1', 'p2']);
});

test('voltar de outra aba: conteúdo novo, mandando o que já foi visto', async () => {
  await renderFeed();
  expect(await screen.findByText('post a1')).toBeTruthy();
  markSeen(['a1', 'b1']);

  await act(async () => {
    onTabFocus('discover');
    onTabFocus('index');
  });
  expect(await screen.findByText('post a2')).toBeTruthy();
  expect(screen.queryByText('post a1')).toBeNull();
  const [page, , seen] = mockFetchFeed.mock.calls.at(-1)!;
  expect(page).toBe(0);
  expect([...seen].sort()).toEqual(['a1', 'b1']);
  // Cada abertura com o seu instante.
  expect(mockFetchFeed.mock.calls[0]![1]).not.toBe(mockFetchFeed.mock.calls.at(-1)![1]);
});

test('Início → Início (ex.: voltar de um post aberto) não troca a lista', async () => {
  await renderFeed();
  expect(await screen.findByText('post a1')).toBeTruthy();
  await act(async () => {
    onTabFocus('index');
  });
  await waitFor(() => expect(mockFetchFeed).toHaveBeenCalledTimes(1));
  expect(screen.getByText('post a1')).toBeTruthy();
});
