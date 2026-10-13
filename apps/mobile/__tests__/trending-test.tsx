import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TrendingSection } from '../src/components/TrendingSection';
import type { ChartTrack } from '../src/lib/api';
import i18n from '../src/lib/i18n';

const mockOpenURL = jest.fn(async (_url: string) => true);
const mockLink = jest.fn();
const mockPlatform = jest.fn();
const mockSetPlatform = jest.fn(async (_platform: string) => undefined);

jest.mock('expo-linking', () => ({ openURL: (url: string) => mockOpenURL(url) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchWorldChart: async () => ({ updated_at: '2026-10-11T12:00:00Z', stale: false, entries: mockEntries }),
  chartTrackLink: (...a: unknown[]) => mockLink(...a),
  getStreamingPlatform: () => mockPlatform(),
  setStreamingPlatform: (p: string) => mockSetPlatform(p),
  fetchTopAlbums: async () => [
    { rank: 1, album_id: 'a1', title: 'Discovery', artist: 'Daft Punk', image_url: null, url: 'https://www.deezer.com/album/1', platform: 'deezer', year: 2001, review_count: 12, average: 9.4 },
    { rank: 2, album_id: 'a2', title: 'Homework', artist: 'Daft Punk', image_url: null, url: 'https://www.deezer.com/album/2', platform: 'deezer', year: 1997, review_count: 1, average: 10 },
  ],
}));

const mockEntries: ChartTrack[] = [
  { position: 1, key: 'sabrina|espresso', title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n Sweet', image_url: null, move: 'new', previous_position: null },
  { position: 2, key: 'kendrick|not like us', title: 'Not Like Us', artist: 'Kendrick Lamar', album: null, image_url: null, move: 'up', previous_position: 5 },
];

async function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <TrendingSection />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
});

describe('Trending (mais tocadas no mundo)', () => {
  test('mostra o ranking com álbum e selos, e abre a música na plataforma da pessoa', async () => {
    mockPlatform.mockResolvedValue('spotify');
    mockLink.mockResolvedValue('https://open.spotify.com/track/abc');
    await wrap();
    await waitFor(() => expect(screen.getByText('Espresso')).toBeTruthy());
    expect(screen.getByText('Short n Sweet')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByLabelText('Subiu (estava em 5º)')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/as músicas abrem no Spotify/)).toBeTruthy());

    await fireEvent.press(screen.getByTestId('chart-2'));
    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/abc'));
    expect(mockLink).toHaveBeenCalledWith('kendrick|not like us', 'spotify');
  });

  test('servidor fora do ar: abre a busca da música na plataforma', async () => {
    mockPlatform.mockResolvedValue('youtube_music');
    mockLink.mockRejectedValue(new Error('offline'));
    await wrap();
    await waitFor(() => expect(screen.getByText(/abrem no YouTube Music/)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('chart-1'));
    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('https://music.youtube.com/search?q=Espresso%20Sabrina%20Carpenter'));
  });

  test('conta sem plataforma: pergunta uma vez, salva e já abre', async () => {
    mockPlatform.mockResolvedValue(null);
    mockLink.mockResolvedValue('https://www.deezer.com/track/1');
    await wrap();
    await waitFor(() => expect(screen.getByText('Espresso')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('chart-1'));
    expect(screen.getByText('Onde você escuta música?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('streaming-deezer'));
    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('https://www.deezer.com/track/1'));
    expect(mockSetPlatform).toHaveBeenCalledWith('deezer');
    expect(mockLink).toHaveBeenCalledWith('sabrina|espresso', 'deezer');
  });
});

test('Top Reviews: álbuns com a média ao lado; tocar abre o álbum', async () => {
  const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
  await wrap();
  await fireEvent.press(await screen.findByTestId('trending-view-reviews'));
  expect(await screen.findByText('Discovery')).toBeTruthy();
  expect(screen.getByTestId('top-album-average-1')).toHaveTextContent('9,4');
  expect(screen.getByText('12 reviews')).toBeTruthy();
  expect(screen.getByText('1 review')).toBeTruthy();
  expect(screen.getByText('Daft Punk · 2001')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('top-album-1'));
  expect(router.push).toHaveBeenCalledWith('/album/a1');
  // Volta para o Top Global.
  await fireEvent.press(screen.getByTestId('trending-view-global'));
  expect(await screen.findByText('Espresso')).toBeTruthy();
});
