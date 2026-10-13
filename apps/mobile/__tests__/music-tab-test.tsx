// Aba Músicas: o logo e o link são da plataforma que a pessoa escolheu, não da origem (Deezer).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import MusicScreen from '../src/app/(tabs)/music';
import i18n from '../src/lib/i18n';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, profile: { id: 'me' } }) }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));
const mockOpenURL = jest.fn(async (_url: string) => true);
jest.mock('expo-linking', () => ({ openURL: (url: string) => mockOpenURL(url) }));
const mockLink = jest.fn(async (_id: string, _p: string) => 'https://open.spotify.com/track/abc');
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchLikedTracks: async () => [
    { link_preview_id: 'p1', url: 'https://www.deezer.com/track/1', platform: 'deezer', title: 'One More Time', artist: 'Daft Punk', image_url: null },
  ],
  fetchMyTracks: async () => [],
  fetchReviews: async () => [],
  trackLink: (id: string, p: string) => mockLink(id, p),
  getStreamingPlatform: async () => 'spotify',
  fetchUnreadNotifications: async () => 0,
}));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
});

test('mostra e abre na plataforma escolhida', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <MusicScreen />
    </QueryClientProvider>,
  );
  // Abre em Reviews; as curtidas ficam na segunda aba.
  expect(await screen.findByText('Reviews de álbuns')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('tab-liked'));
  await waitFor(() => expect(screen.getByLabelText(/One More Time, Daft Punk\. Ouvir no Spotify/)).toBeTruthy());
  await fireEvent.press(screen.getByLabelText(/One More Time/));
  await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/abc'));
  expect(mockLink).toHaveBeenCalledWith('p1', 'spotify');
});
