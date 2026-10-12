// Início: abas Para você e Seguindo, botão Seguir nos posts e contas sugeridas.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import FeedScreen from '../src/app/(tabs)/index';
import i18n from '../src/lib/i18n';
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

function mockPost(id: string, author: string, username: string): FeedItem {
  return {
    id, body: `post ${id}`, genre: null, like_count: 0, comment_count: 0, created_at: new Date().toISOString(), liked_by_me: false,
    author_id: author, author_username: username, author_display_name: username.toUpperCase(), author_avatar_url: null,
    preview_url: null, preview_platform: null, preview_kind: null, preview_title: null, preview_artist: null, preview_image_url: null,
    score: 1, genres: [], media: [], post_type: 'text',
  } as unknown as FeedItem;
}

const mockSetFollowing = jest.fn(async (_id: string, _follow: boolean) => undefined);
const mockFollowingFeed = jest.fn(async (): Promise<FeedItem[]> => []);
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchFeed: async () => [
    mockPost('p1', 'friend', 'amiga'),
    mockPost('p2', 'stranger', 'desconhecida'),
    mockPost('p3', 'me', 'raul'),
    mockPost('p4', 'stranger', 'desconhecida'),
    mockPost('p5', 'other', 'outra'),
  ],
  fetchFollowingFeed: () => mockFollowingFeed(),
  fetchMyFollowingIds: async () => ['friend'],
  fetchSuggestedAccounts: async () => [
    { id: 's1', username: 'bossa_fan', display_name: 'Bossa Fan', avatar_url: null, genres: ['bossa_nova'], reason: 'genres' },
    { id: 's2', username: 'amigo2', display_name: 'Amigo 2', avatar_url: null, genres: [], reason: 'friends' },
  ],
  setFollowing: (id: string, follow: boolean) => mockSetFollowing(id, follow),
  fetchVibesTray: async () => [],
  fetchUnreadNotifications: async () => 0,
}));

function renderScreen() {
  // gcTime infinito também nas mutações: o timer de limpeza (5 min) segurava o Jest aberto.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <FeedScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
});

test('Para você: Seguir só em quem ainda não sigo (nem em mim nem em quem sigo)', async () => {
  await renderScreen();
  await waitFor(() => expect(screen.getAllByTestId('follow-desconhecida').length).toBeGreaterThan(0));
  expect(screen.queryByTestId('follow-amiga')).toBeNull();
  expect(screen.queryByTestId('follow-raul')).toBeNull();
  expect(screen.getByTestId('follow-outra')).toBeTruthy();

  // Seguir: o botão some de todos os posts dessa pessoa.
  await fireEvent.press(screen.getAllByTestId('follow-desconhecida')[0]!);
  expect(mockSetFollowing).toHaveBeenCalledWith('stranger', true);
  await waitFor(() => expect(screen.queryByTestId('follow-desconhecida')).toBeNull());
  expect(screen.getByTestId('follow-outra')).toBeTruthy();
});

test('Para você: contas sugeridas no meio do feed, com o motivo', async () => {
  await renderScreen();
  const box = await screen.findByTestId('suggested-accounts');
  expect(within(box).getByText('Contas para seguir')).toBeTruthy();
  expect(within(box).getByText('Seguida por quem você segue')).toBeTruthy();
  expect(within(box).getByText(/^Também curte Bossa nova$/i)).toBeTruthy();
  await fireEvent.press(within(box).getByTestId('suggest-follow-bossa_fan'));
  expect(mockSetFollowing).toHaveBeenCalledWith('s1', true);
  await waitFor(() => expect(within(box).getByTestId('suggest-follow-bossa_fan')).toHaveTextContent('Seguindo'));
});

test('Seguindo: só busca ao abrir; vazia, sugere contas', async () => {
  await renderScreen();
  await screen.findAllByTestId('follow-desconhecida');
  expect(mockFollowingFeed).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('tab-following'));
  await waitFor(() => expect(mockFollowingFeed).toHaveBeenCalled());
  expect(await screen.findByText('Você ainda não segue ninguém. Que tal começar por estas contas?')).toBeTruthy();
  expect(screen.getByTestId('suggested-following-empty')).toBeTruthy();
});

test('Seguindo: posts de quem sigo, sem botão Seguir', async () => {
  mockFollowingFeed.mockResolvedValueOnce([mockPost('f1', 'friend', 'amiga')]);
  await renderScreen();
  await fireEvent.press(screen.getByTestId('tab-following'));
  await waitFor(() => expect(screen.getByText('post f1')).toBeTruthy());
  expect(screen.getByTestId('tab-following').props.accessibilityState.selected).toBe(true);
});
