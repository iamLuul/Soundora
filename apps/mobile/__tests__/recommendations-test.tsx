// Para você: faixas de reviews populares, pesquisas guardadas para recomendar e a tela do histórico.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import FeedScreen from '../src/app/(tabs)/index';
import SearchHistoryScreen from '../src/app/settings/search-history';
import { reviewStrips } from '../src/components/ReviewStrip';
import { SearchPanel } from '../src/components/SearchPanel';
import type { AlbumReview } from '../src/lib/api';
import i18n from '../src/lib/i18n';
import type { FeedItem } from '../src/lib/types';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: View };
});
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: () => undefined,
}));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));

// A lista monta tudo de uma vez (no app ela monta aos poucos, conforme rola).
jest.mock('../src/lib/list', () => ({ listPerf: { initialNumToRender: 100 } }));

const mockRpc = jest.fn(async (_name: string, _args?: unknown): Promise<{ data: unknown; error: null }> => ({ data: [], error: null }));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'order', 'ilike', 'in', 'limit', 'or']) chain[k] = () => chain;
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return chain;
    },
  },
  supabaseUrl: 'http://localhost:54321',
}));

function post(i: number): FeedItem {
  return {
    id: `p${i}`, body: `post ${i}`, genre: null, like_count: 0, comment_count: 0, created_at: new Date().toISOString(), liked_by_me: false,
    author_id: 'other', author_username: 'outra', author_display_name: 'Outra', author_avatar_url: null,
    preview_url: null, preview_platform: null, preview_kind: null, preview_title: null, preview_artist: null, preview_image_url: null,
    score: 1, genres: [], media: [], post_type: 'text',
  } as unknown as FeedItem;
}

function review(i: number): AlbumReview {
  return {
    id: `r${i}`, rating: 8.5, body: `review ${i} longa o bastante sobre o disco`, like_count: 10 - i, liked_by_me: false,
    created_at: new Date().toISOString(), author_id: `a${i}`, author_username: `fa${i}`, author_display_name: `Fã ${i}`, author_avatar_url: null,
    album_id: `al${i}`, album_title: `Álbum ${i}`, album_artist: `Artista ${i}`, album_image_url: null, album_url: 'https://www.deezer.com/album/1',
    album_platform: 'deezer', album_year: 2020,
  };
}

let mockPosts: FeedItem[] = [];
let mockReviews: AlbumReview[] = [];
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchFeed: async () => mockPosts,
  fetchReviewsForYou: async () => mockReviews,
  fetchMyFollowingIds: async () => [],
  fetchSuggestedAccounts: async () => [],
  fetchVibesTray: async () => [],
  fetchUnreadNotifications: async () => 0,
  searchProfiles: async () => [],
  searchTracks: async () => [],
  searchPostGenres: async () => [{ slug: 'dream_pop', name_pt: 'Dream pop', name_en: 'Dream pop', post_count: 3 }],
  searchPosts: async () => [],
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const defaultRpc = async (): Promise<{ data: unknown; error: null }> => ({ data: [], error: null });

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
  mockRpc.mockImplementation(defaultRpc);
  mockPosts = Array.from({ length: 30 }, (_, i) => post(i + 1));
  mockReviews = Array.from({ length: 9 }, (_, i) => review(i + 1));
});

test('reviews em faixas de até 5; a última só com 3 ou mais', () => {
  expect(reviewStrips(mockReviews).map((s) => s.length)).toEqual([5, 4]);
  expect(reviewStrips(mockReviews.slice(0, 7)).map((s) => s.length)).toEqual([5]);
  expect(reviewStrips([])).toEqual([]);
});

test('Para você: faixa "Reviews que você pode curtir" depois do 10º post; tocar abre o álbum', async () => {
  const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
  await wrap(<FeedScreen />);
  const strip = await screen.findByTestId('review-strip-0');
  expect(within(strip).getByText('Reviews que você pode curtir')).toBeTruthy();
  expect(within(strip).getAllByTestId(/^strip-review-/)).toHaveLength(5);
  expect(within(strip).getByText('Álbum 1')).toBeTruthy();
  expect(within(strip).getByText('@fa1')).toBeTruthy();
  // A segunda faixa vai depois do 25º post (há 30).
  expect(screen.getByTestId('review-strip-1')).toBeTruthy();
  await fireEvent.press(within(strip).getByTestId('strip-review-r2'));
  expect(router.push).toHaveBeenCalledWith('/album/al2');
});

test('Para você: sem reviews, nenhuma faixa', async () => {
  mockReviews = [];
  await wrap(<FeedScreen />);
  await screen.findByText('post 1');
  expect(screen.queryByTestId('review-strip-0')).toBeNull();
});

test('Para você: com poucos posts, a faixa espera ter posts depois dela', async () => {
  mockReviews = Array.from({ length: 5 }, (_, i) => review(i + 1));
  mockPosts = Array.from({ length: 10 }, (_, i) => post(i + 1));
  await wrap(<FeedScreen />);
  await screen.findByText('post 10');
  // A faixa só entra quando há posts depois dela.
  expect(screen.queryByTestId('review-strip-0')).toBeNull();
});

describe('pesquisas', () => {
  const logged = () => mockRpc.mock.calls.filter(([name]) => name === 'log_search').map(([, args]) => (args as { p_term: string }).p_term);

  test('só guarda o que foi pesquisado de verdade: Enter e abrir um gênero (digitar, não)', async () => {
    await wrap(<SearchPanel />);
    await fireEvent.changeText(screen.getByTestId('search-input'), 'dream');
    await screen.findByTestId('genre-result-dream_pop');
    expect(logged()).toEqual([]);
    await fireEvent(screen.getByTestId('search-input'), 'submitEditing');
    expect(logged()).toEqual(['dream']);
  });

  test('abrir um gênero da busca guarda o gênero', async () => {
    await wrap(<SearchPanel />);
    await fireEvent.changeText(screen.getByTestId('search-input'), 'dream');
    await fireEvent.press(await screen.findByTestId('genre-result-dream_pop'));
    expect(logged()).toEqual(['dream pop']);
  });

  test('vindo da busca do desktop (com o termo), guarda', async () => {
    await wrap(<SearchPanel initialQuery="Marina Sena" />);
    expect(logged()).toEqual(['Marina Sena']);
  });
});

describe('histórico de pesquisas (Configurações)', () => {
  const history = (enabled: boolean, terms: string[]) =>
    terms.length
      ? terms.map((term) => ({ enabled, term, searched_at: new Date().toISOString() }))
      : [{ enabled, term: null, searched_at: null }];

  test('mostra os termos; apaga um; desligar pergunta, apaga tudo e avisa que está desligado', async () => {
    mockRpc.mockImplementation(async (name: string) => ({ data: name === 'my_search_history' ? history(true, ['samba', 'marina sena']) : null, error: null }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await wrap(<SearchHistoryScreen />);
    expect(await screen.findByTestId('search-term-samba')).toBeTruthy();
    expect(screen.getByText('2 pesquisas guardadas')).toBeTruthy();
    expect(screen.getByTestId('search-history-switch').props.value).toBe(true);

    await fireEvent.press(screen.getByTestId('search-term-remove-samba'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('clear_search_history', { p_term: 'samba' }));
    await waitFor(() => expect(screen.queryByTestId('search-term-samba')).toBeNull());

    await fireEvent(screen.getByTestId('search-history-switch'), 'valueChange', false);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('set_search_history_enabled', { p_enabled: false }));
    expect(await screen.findByText('Desligado: suas pesquisas não são guardadas.')).toBeTruthy();
    expect(screen.queryByTestId('search-term-marina sena')).toBeNull();
    alert.mockRestore();
  });

  test('vazio e ligado: avisa que não há nada', async () => {
    mockRpc.mockImplementation(async (name: string) => ({ data: name === 'my_search_history' ? history(true, []) : null, error: null }));
    await wrap(<SearchHistoryScreen />);
    expect(await screen.findByText('Nenhuma pesquisa guardada ainda.')).toBeTruthy();
  });
});
