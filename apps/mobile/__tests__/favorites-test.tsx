// Perfil › Músicas favoritas: adicionar pela busca, reordenar, tirar e salvar.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FavoritesScreen from '../src/app/settings/favorites';
import i18n from '../src/lib/i18n';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' } }) }));

const song = (id: string, title: string) => ({ slot: 0, link_preview_id: id, title, artist: 'Artista', image_url: null, url: 'https://x', platform: 'deezer' });
const mockSave = jest.fn(async (_ids: string[]) => undefined);
let mockCurrent = [song('p1', 'Primeira'), song('p2', 'Segunda')];
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchFavoriteSongs: async () => mockCurrent,
  setFavoriteSongs: (ids: string[]) => mockSave(ids),
  searchSongs: async () => [{ id: '99', title: 'Nova', artist: 'Banda', album: null, image_url: null }],
  pickSong: async () => ({ link_preview_id: 'p9', title: 'Nova', artist: 'Banda', image_url: null, url: 'https://z', platform: 'deezer' }),
}));

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <FavoritesScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  mockSave.mockClear();
  mockCurrent = [song('p1', 'Primeira'), song('p2', 'Segunda')];
});

test('adiciona pela busca, sobe a nova para o topo, tira uma e salva na ordem', async () => {
  await wrap();
  expect(await screen.findByTestId('fav-row-2')).toHaveTextContent(/Segunda/);
  expect(screen.getByTestId('save-favorites')).toBeDisabled();
  await fireEvent.changeText(screen.getByTestId('song-search'), 'nova');
  await fireEvent.press(await screen.findByTestId('song-hit-99'));
  await waitFor(() => expect(screen.getByTestId('fav-row-3')).toHaveTextContent(/Nova/));
  await fireEvent.press(screen.getByTestId('fav-up-3'));
  await fireEvent.press(screen.getByTestId('fav-up-2'));
  await fireEvent.press(screen.getByTestId('fav-remove-3'));
  await fireEvent.press(screen.getByTestId('save-favorites'));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(['p9', 'p1']));
});

test('com 5 escolhidas, a busca some e aparece o aviso', async () => {
  mockCurrent = ['a', 'b', 'c', 'd', 'e'].map((x) => song(x, `Música ${x}`));
  await wrap();
  expect(await screen.findByText('Você já tem 5. Tire uma para adicionar outra.')).toBeTruthy();
  expect(screen.queryByTestId('song-search')).toBeNull();
});
