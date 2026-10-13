// Reviews de álbuns: cartão, estrelas, escrever (álbum obrigatório) e curtir.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AlbumScreen from '../src/app/album/[id]';
import { ReviewCard } from '../src/components/ReviewCard';
import { ReviewComposer } from '../src/components/ReviewComposer';
import { ReviewList } from '../src/components/ReviewList';
import { Stars, StarRatingInput } from '../src/components/StarRating';
import { type AlbumReview, clampRating } from '../src/lib/api';
import i18n from '../src/lib/i18n';
import { formatRating } from '../src/lib/reviews';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'a1' }),
  useFocusEffect: () => undefined,
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, profile: { id: 'me' } }) }));

const review = (over: Partial<AlbumReview> = {}): AlbumReview => ({
  id: 'r1',
  rating: 9.1,
  body: '"Graduation" é um álbum marcante na carreira do Kanye West.',
  like_count: 192,
  liked_by_me: false,
  created_at: new Date().toISOString(),
  author_id: 'u1',
  author_username: 'lilted',
  author_display_name: 'Lil Ted',
  author_avatar_url: null,
  album_id: 'a1',
  album_title: 'Graduation',
  album_artist: 'Kanye West',
  album_image_url: null,
  album_url: 'https://www.deezer.com/album/1',
  album_platform: 'deezer',
  album_year: 2007,
  ...over,
});

const mockCreate = jest.fn(async (_input: unknown) => 'new-id');
const mockDelete = jest.fn(async (_id: string) => undefined);
const mockLike = jest.fn(async (_id: string, _liked: boolean) => undefined);
const mockPick = jest.fn(async (id: string) => ({ id: `card-${id}`, title: 'Discovery', artist: 'Daft Punk', image_url: null, release_year: 2001 }));
let mockReviews: AlbumReview[] = [];
let mockFailNext = false;
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  createReview: (input: unknown) => mockCreate(input),
  setReviewLiked: (id: string, liked: boolean) => mockLike(id, liked),
  deleteReview: (id: string) => mockDelete(id),
  fetchReviews: async () => {
    if (mockFailNext) {
      mockFailNext = false;
      throw { message: 'TypeError: Network request failed' };
    }
    return mockReviews;
  },
  searchAlbums: async (q: string) => (q.includes('disc') ? [{ id: '302127', title: 'Discovery', artist: 'Daft Punk', image_url: null, record_type: 'album' }] : []),
  pickAlbum: (id: string) => mockPick(id),
  getStreamingPlatform: async () => 'spotify',
  fetchAlbumSummary: async (id: string) =>
    id === 'a1' ? { rank: 3, album_id: 'a1', title: 'Graduation', artist: 'Kanye West', image_url: null, url: '', platform: 'deezer', year: 2007, review_count: 5, average: 8.7 } : null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
  mockReviews = [];
});

test('nota: uma casa decimal, de 0 a 10; formato do idioma', () => {
  expect(clampRating(9.15)).toBe(9.2);
  expect(clampRating(11)).toBe(10);
  expect(clampRating(-2)).toBe(0);
  expect(clampRating(Number.NaN)).toBe(0);
  expect(formatRating(9.1, 'pt-BR')).toBe('9,1');
  expect(formatRating(8, 'en')).toBe('8.0');
});

test('cartão: álbum, artista, ano, nota, texto e curtidas', async () => {
  const onToggleLike = jest.fn();
  await render(<ReviewCard review={review()} onToggleLike={onToggleLike} />);
  expect(screen.getByText('Graduation')).toBeTruthy();
  expect(screen.getByText('Kanye West')).toBeTruthy();
  expect(screen.getByText('2007')).toBeTruthy();
  expect(screen.getByText('9,1/10')).toBeTruthy();
  expect(screen.getByText('Review')).toBeTruthy();
  expect(screen.getByText('192')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('review-like-r1'));
  expect(onToggleLike).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
});

test('estrelas: + e − mudam 0,1; leitor de tela aumenta/diminui 0,5', async () => {
  const onChange = jest.fn();
  await render(<StarRatingInput value={9} onChange={onChange} />);
  await fireEvent.press(screen.getByTestId('rating-plus'));
  expect(onChange).toHaveBeenLastCalledWith(9.1);
  await fireEvent.press(screen.getByTestId('rating-minus'));
  expect(onChange).toHaveBeenLastCalledWith(8.9);
  await fireEvent(screen.getByTestId('rating-stars'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(onChange).toHaveBeenLastCalledWith(9.5);
  expect(screen.getByTestId('rating-value')).toHaveTextContent('9,0/10');
  await render(<Stars rating={7} />);
});

test('escrever: sem álbum não publica; escolhe o álbum, dá nota, escreve e publica', async () => {
  const onPublished = jest.fn();
  await wrap(<ReviewComposer onPublished={onPublished} />);
  expect(screen.getByTestId('publish-review')).toBeDisabled();
  expect(screen.getByText('Escolha um álbum para escrever a review.')).toBeTruthy();

  await fireEvent.changeText(screen.getByTestId('album-search'), 'discovery');
  await fireEvent.press(await screen.findByTestId('album-hit-302127'));
  await waitFor(() => expect(screen.getByTestId('review-album')).toBeTruthy());
  expect(mockPick).toHaveBeenCalledWith('302127');
  expect(screen.getByText('2001')).toBeTruthy();

  // Sem nota e com texto curto: ainda não publica.
  await fireEvent.changeText(screen.getByTestId('review-body'), 'curto');
  expect(screen.getByText('Mínimo de 20 caracteres (5/20)')).toBeTruthy();
  expect(screen.getByTestId('publish-review')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('rating-plus'));
  await fireEvent.changeText(screen.getByTestId('review-body'), 'Um disco que mudou a música eletrônica para sempre.');
  expect(screen.getByTestId('publish-review')).not.toBeDisabled();
  await fireEvent.press(screen.getByTestId('publish-review'));
  await waitFor(() => expect(onPublished).toHaveBeenCalled());
  expect(mockCreate).toHaveBeenCalledWith({ albumId: 'card-302127', rating: 0.1, body: 'Um disco que mudou a música eletrônica para sempre.' });
});

test('link que não é de álbum é recusado', async () => {
  await wrap(<ReviewComposer onPublished={jest.fn()} />);
  await fireEvent.changeText(screen.getByTestId('album-link'), 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  await fireEvent.press(screen.getByTestId('album-link-go'));
  expect(await screen.findByText(/não é de um álbum/)).toBeTruthy();
});

test('lista: curtir muda na hora e chama o banco', async () => {
  mockReviews = [review()];
  await wrap(<ReviewList />);
  expect(await screen.findByText('Graduation')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('review-like-r1'));
  await waitFor(() => expect(screen.getByText('193')).toBeTruthy());
  expect(mockLike).toHaveBeenCalledWith('r1', true);
});

test('lista vazia: convida a escrever', async () => {
  await wrap(<ReviewList />);
  expect(await screen.findByText(/Ainda não há reviews/)).toBeTruthy();
});

test('tela do álbum: média, posição e as reviews dele', async () => {
  mockReviews = [review({ id: 'r9', body: 'Review do álbum Graduation, com mais de vinte letras.' })];
  await wrap(<AlbumScreen />);
  expect(await screen.findByTestId('album-header')).toBeTruthy();
  expect(screen.getByTestId('album-average')).toHaveTextContent('8,7/10');
  expect(screen.getByText('#3 · 5 reviews')).toBeTruthy();
  expect(await screen.findByText('Review do álbum Graduation, com mais de vinte letras.')).toBeTruthy();
});

test('na lista geral, tocar no álbum da review abre a tela do álbum', async () => {
  const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
  mockReviews = [review()];
  await wrap(<ReviewList />);
  await fireEvent.press(await screen.findByTestId('review-album-r1'));
  expect(router.push).toHaveBeenCalledWith('/album/a1');
});

test('apagar a própria review pede confirmação; cancelar não apaga', async () => {
  const { Alert } = jest.requireActual('react-native');
  let answer = 'cancel';
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
    const [, msg, buttons] = args as [unknown, unknown, { style?: string; onPress?: () => void }[] | undefined];
    expect(String(msg)).toMatch(/Apagar esta review\?/);
    buttons?.find((b) => (answer === 'ok' ? b.style === 'destructive' : b.style === 'cancel'))?.onPress?.();
  });
  mockReviews = [review({ author_id: 'me' })];
  await wrap(<ReviewList />);
  await fireEvent.press(await screen.findByTestId('review-more-r1'));
  await fireEvent.press(await screen.findByText('Apagar review'));
  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(mockDelete).not.toHaveBeenCalled();
  answer = 'ok';
  await fireEvent.press(screen.getByTestId('review-more-r1'));
  await fireEvent.press(await screen.findByText('Apagar review'));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('r1'));
  spy.mockRestore();
});

test('falhou ao carregar: mostra o motivo e "Tentar de novo" carrega de novo', async () => {
  mockFailNext = true;
  mockReviews = [review()];
  await wrap(<ReviewList />);
  expect(await screen.findByText(/^Sem conexão. Confira sua internet e tente de novo./)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('error-state-retry'));
  expect(await screen.findByText('Graduation')).toBeTruthy();
});
