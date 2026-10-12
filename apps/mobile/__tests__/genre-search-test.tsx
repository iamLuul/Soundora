// Buscar por gênero: gêneros na busca, a lista de gêneros sem texto e a tela com os posts.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import GenrePostsScreen from '../src/app/genre/[slug]';
import { relevantGenres, SearchPanel, SearchResults } from '../src/components/SearchPanel';
import type { GenreHit } from '../src/lib/api';
import i18n from '../src/lib/i18n';
import type { FeedItem } from '../src/lib/types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ slug: 'shoegaze' }),
  useFocusEffect: () => undefined,
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, profile: { id: 'me' } }) }));

const featured = [
  { slug: 'mpb', name_pt: 'MPB', name_en: 'MPB' },
  { slug: 'shoegaze', name_pt: 'Shoegaze', name_en: 'Shoegaze' },
];
jest.mock('../src/lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => {
      chain._slug = col === 'slug' ? (v as string) : chain._slug;
      return chain;
    },
    order: async () => ({ data: featured, error: null }),
    maybeSingle: async () => ({ data: featured.find((g) => g.slug === chain._slug) ?? null, error: null }),
    _slug: '' as string,
  };
  return { supabase: { from: () => chain }, supabaseUrl: 'http://localhost:54321' };
});

const mockGenrePosts = jest.fn(async (_genre: string, _before: unknown): Promise<FeedItem[]> => []);
const mockSearchPosts = jest.fn(async (_q: string, _before: unknown): Promise<FeedItem[]> => []);
let mockPeople: unknown[] = [];
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchGenrePosts: (genre: string, before: unknown) => mockGenrePosts(genre, before),
  searchPosts: (q: string, before: unknown) => mockSearchPosts(q, before),
  searchProfiles: async () => mockPeople,
  searchTracks: async () => [],
  searchPostGenres: async () => [],
  fetchMyFollowingIds: async () => [],
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function post(id: string): FeedItem {
  return {
    id, body: `post ${id}`, genre: 'shoegaze', like_count: 0, comment_count: 0, created_at: new Date().toISOString(), liked_by_me: false,
    author_id: 'a1', author_username: 'ana', author_display_name: 'Ana', author_avatar_url: null,
    preview_url: null, preview_platform: null, preview_kind: null, preview_title: null, preview_artist: null, preview_image_url: null,
    score: null, genres: ['shoegaze', 'dream_pop'], media: [], post_type: 'music',
  } as unknown as FeedItem;
}

const hits: GenreHit[] = [
  { slug: 'shoegaze', name_pt: 'Shoegaze', name_en: 'Shoegaze', post_count: 12 },
  { slug: 'nu_gaze', name_pt: 'Nu Gaze', name_en: 'Nu Gaze', post_count: 1 },
];

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  mockGenrePosts.mockClear();
  mockSearchPosts.mockClear();
  mockPeople = [];
});

test('a busca mostra os gêneros com quantos posts têm; tocar abre o gênero', async () => {
  const onOpenGenre = jest.fn();
  await render(<SearchResults query="gaze" people={[]} tracks={[]} genres={hits} loading={false} onOpenProfile={jest.fn()} onOpenGenre={onOpenGenre} />);
  expect(screen.getByText('Gêneros')).toBeTruthy();
  expect(screen.getByText('12 posts')).toBeTruthy();
  expect(screen.getByText('1 post')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('genre-result-shoegaze'));
  expect(onOpenGenre).toHaveBeenCalledWith('shoegaze');
});

test('só gêneros com posts; se nenhum tiver, até 3 sem posts', () => {
  const zero = (slug: string): GenreHit => ({ slug, name_pt: slug, name_en: slug, post_count: 0 });
  expect(relevantGenres([hits[0]!, zero('a'), hits[1]!]).map((g) => g.slug)).toEqual(['shoegaze', 'nu_gaze']);
  expect(relevantGenres([zero('a'), zero('b'), zero('c'), zero('d')]).map((g) => g.slug)).toEqual(['a', 'b', 'c']);
  expect(i18n.t('search.genrePosts', { count: 0 })).toBe('nenhum post ainda');
});

test('a tela do gênero lista os posts com ele e tem o título do gênero', async () => {
  mockGenrePosts.mockResolvedValueOnce([post('p1'), post('p2')]);
  await wrap(<GenrePostsScreen />);
  expect(await screen.findByText('post p1')).toBeTruthy();
  expect(screen.getByText('post p2')).toBeTruthy();
  expect(mockGenrePosts).toHaveBeenCalledWith('shoegaze', null);
  await waitFor(() => expect(screen.getByTestId('genre-title')).toHaveTextContent('Posts de Shoegaze'));
  // O gênero no post também leva para a tela do gênero.
  expect(screen.getAllByTestId('post-genre-dream_pop').length).toBe(2);
});

test('gênero sem posts: aviso', async () => {
  await wrap(<GenrePostsScreen />);
  expect(await screen.findByText('Ninguém postou com esse gênero ainda.')).toBeTruthy();
});

test('tocar no gênero do post abre a tela do gênero', async () => {
  const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
  mockGenrePosts.mockResolvedValueOnce([post('p1')]);
  await wrap(<GenrePostsScreen />);
  await fireEvent.press(await screen.findByTestId('post-genre-dream_pop'));
  expect(router.push).toHaveBeenCalledWith('/genre/dream_pop');
});

test('sem texto, a busca não mostra nada (nem lista de gêneros)', async () => {
  await wrap(<SearchPanel />);
  expect(screen.queryByText('Gêneros')).toBeNull();
  expect(screen.queryByText('Digite pelo menos 2 letras.')).toBeNull();
});

test('palavra que não é pessoa, música nem gênero: ao pesquisar, mostra os posts com ela', async () => {
  mockSearchPosts.mockResolvedValueOnce([post('p9')]);
  await wrap(<SearchPanel />);
  await fireEvent.changeText(screen.getByTestId('search-input'), 'incrivel');
  expect(await screen.findByText('Nada encontrado para “incrivel”.')).toBeTruthy();
  expect(mockSearchPosts).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('search-input'), 'submitEditing');
  expect(await screen.findByText('post p9')).toBeTruthy();
  expect(screen.getByText('Posts com “incrivel”')).toBeTruthy();
  expect(mockSearchPosts).toHaveBeenCalledWith('incrivel', null);
  // Mudou o texto: volta para a busca normal.
  await fireEvent.changeText(screen.getByTestId('search-input'), 'incrive');
  await waitFor(() => expect(screen.queryByText('post p9')).toBeNull());
});

test('o botão "Procurar nos posts" faz o mesmo que pesquisar', async () => {
  await wrap(<SearchPanel />);
  await fireEvent.changeText(screen.getByTestId('search-input'), 'zzz');
  await fireEvent.press(await screen.findByTestId('search-posts'));
  expect(await screen.findByText('Nenhum post com “zzz”.')).toBeTruthy();
});

test('mesmo achando pessoa, Enter vai direto para os posts com o termo (e o botão também)', async () => {
  mockPeople = [{ id: 'u1', username: 'incrivel', display_name: 'Incrível', avatar_url: null }];
  mockSearchPosts.mockResolvedValue([post('p7')]);
  await wrap(<SearchPanel />);
  await fireEvent.changeText(screen.getByTestId('search-input'), 'incrivel');
  expect(await screen.findByText('Pessoas')).toBeTruthy();
  await fireEvent(screen.getByTestId('search-input'), 'submitEditing');
  expect(await screen.findByText('post p7')).toBeTruthy();
  expect(screen.queryByText('Pessoas')).toBeNull();
  expect(mockSearchPosts).toHaveBeenCalledWith('incrivel', null);
  // Voltando a digitar, a busca normal; o botão abaixo dos resultados também leva aos posts.
  await fireEvent.changeText(screen.getByTestId('search-input'), 'incriveis');
  await fireEvent.changeText(screen.getByTestId('search-input'), 'incrivel');
  expect(await screen.findByText('Pessoas')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('search-posts'));
  expect(await screen.findByText('post p7')).toBeTruthy();
  mockSearchPosts.mockReset();
  mockSearchPosts.mockImplementation(async () => []);
});
