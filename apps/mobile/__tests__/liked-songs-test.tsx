// Perfil › Curtidas: músicas curtidas no Descobrir (não mais posts curtidos).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LikedSongsScreen from '../src/app/liked/[username]';
import i18n from '../src/lib/i18n';
import type { LikedSong } from '../src/lib/types';

let mockParams = { username: 'carla', id: 'u-carla' };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  router: { back: jest.fn(), canGoBack: () => true },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'u-me' } }) }));

const mockOpenURL = jest.fn(async (_url: string) => true);
jest.mock('expo-linking', () => ({ openURL: (url: string) => mockOpenURL(url) }));

const song = (id: string, title: string): LikedSong => ({
  link_preview_id: id,
  url: `https://www.deezer.com/track/${id}`,
  platform: 'deezer',
  title,
  artist: 'Daft Punk',
  album: 'Discovery',
  image_url: null,
  liked_at: '2026-10-11T12:00:00Z',
});
let mockUnliked = new Set<string>();
const mockFetch = jest.fn(async (_user: string, _before: unknown) => [song('1', 'One More Time'), song('2', 'Digital Love')].filter((s) => !mockUnliked.has(s.link_preview_id)));
const mockSwipe = jest.fn(async (card: { link_preview_id: string }) => void mockUnliked.add(card.link_preview_id));
const mockLink = jest.fn(async (_id: string, _p: string) => 'https://open.spotify.com/track/abc');
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchProfileLikedSongs: (u: string, b: unknown) => mockFetch(u, b),
  swipeDiscover: (card: { link_preview_id: string }) => mockSwipe(card),
  trackLink: (id: string, p: string) => mockLink(id, p),
  getStreamingPlatform: async () => 'spotify',
}));

async function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <LikedSongsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
  mockUnliked = new Set();
});

test('mostra as músicas curtidas da pessoa e abre na minha plataforma', async () => {
  mockParams = { username: 'carla', id: 'u-carla' };
  await wrap();
  await waitFor(() => expect(screen.getByText('One More Time')).toBeTruthy());
  expect(screen.getByText('Músicas curtidas por @carla')).toBeTruthy();
  expect(mockFetch).toHaveBeenCalledWith('u-carla', null);
  // De outra pessoa: sem botão de descurtir.
  expect(screen.queryByTestId('unlike-1')).toBeNull();
  await fireEvent.press(screen.getByTestId('liked-2'));
  await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/abc'));
  expect(mockLink).toHaveBeenCalledWith('2', 'spotify');
});

test('nas minhas, a estrela descurte e tira da lista', async () => {
  mockParams = { username: 'eu', id: 'u-me' };
  await wrap();
  await waitFor(() => expect(screen.getByTestId('unlike-1')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('unlike-1'));
  await waitFor(() => expect(screen.queryByText('One More Time')).toBeNull());
  expect(mockSwipe).toHaveBeenCalledWith({ link_preview_id: '1', post_id: null });
  expect(screen.getByText('Digital Love')).toBeTruthy();
});
