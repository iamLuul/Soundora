/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock exige require() dentro da fábrica */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DiscoverSection, mergeDeck } from '../src/components/DiscoverSection';
import i18n from '../src/lib/i18n';
import type { DiscoverCard, LikedSong } from '../src/lib/types';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: [], error: null })),
    from: () => ({
      select: () => {
        const q = { eq: () => q, order: async () => ({
          data: [
            { slug: 'rock', name_pt: 'Rock', name_en: 'Rock' },
            { slug: 'funk_br', name_pt: 'Funk', name_en: 'Brazilian funk' },
          ],
          error: null,
        }) };
        return q;
      },
    }),
  },
}));

const mockOpenURL = jest.fn(async (_url: string) => true);
jest.mock('expo-linking', () => ({ openURL: (url: string) => mockOpenURL(url) }));

const mockRecs = jest.fn();
const mockSwipe = jest.fn(async (_card: unknown, _liked: boolean) => undefined);
const mockLink = jest.fn(async (_id: string, _platform: string) => 'https://open.spotify.com/track/abc');
let mockLiked: LikedSong[] = [];
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchRecommendations: (genre: string | null) => mockRecs(genre),
  fetchDiscoverCards: async () => [],
  fetchLikedSongs: async () => mockLiked,
  swipeDiscover: (card: unknown, liked: boolean) => mockSwipe(card, liked),
  trackLink: (id: string, platform: string) => mockLink(id, platform),
  getStreamingPlatform: async () => 'spotify',
}));

const rec = (id: string, title: string, extra: Partial<DiscoverCard> = {}): DiscoverCard => ({
  link_preview_id: id,
  url: `https://www.deezer.com/track/${id}`,
  platform: 'deezer',
  kind: 'track',
  title,
  artist: 'Daft Punk',
  image_url: null,
  genre: null,
  source: 'for_you',
  note: null,
  post_id: null,
  recommender_username: null,
  recommender_display_name: null,
  recommender_avatar_url: null,
  album: 'Discovery',
  audio_url: `https://cdnt-preview.dzcdn.net/${id}.mp3`,
  reason: 'similar',
  because: 'Justice – D.A.N.C.E.',
  ...extra,
});

async function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <DiscoverSection />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
  mockLiked = [];
  mockRecs.mockResolvedValue([rec('11', 'One More Time'), rec('12', 'Digital Love')]);
});

describe('Descobrir', () => {
  test('mostra a sugestão com álbum e o motivo; curtir guarda em "Músicas curtidas"', async () => {
    await wrap();
    await waitFor(() => expect(screen.getByText('One More Time')).toBeTruthy());
    expect(screen.getAllByText('Discovery').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Porque você curtiu Justice – D.A.N.C.E.').length).toBeGreaterThan(0);
    expect(mockRecs).toHaveBeenCalledWith(null);

    jest.useFakeTimers();
    await fireEvent.press(screen.getByTestId('discover-like'));
    await act(async () => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
    expect(mockSwipe).toHaveBeenCalledWith(expect.objectContaining({ link_preview_id: '11' }), true);
    await waitFor(() => expect(screen.getByTestId('liked-11')).toBeTruthy());
  });

  test('play alterna a prévia; tocar na música curtida abre na plataforma da pessoa', async () => {
    mockLiked = [{ link_preview_id: '99', url: 'https://www.deezer.com/track/99', platform: 'deezer', title: 'Get Lucky', artist: 'Daft Punk', album: 'RAM', image_url: null, liked_at: '' }];
    await wrap();
    await waitFor(() => expect(screen.getByLabelText('Ouvir a prévia')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('discover-play'));
    expect(screen.getByLabelText('Pausar a prévia')).toBeTruthy();

    await waitFor(() => expect(screen.getByText('Get Lucky')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('liked-99'));
    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/abc'));
    expect(mockLink).toHaveBeenCalledWith('99', 'spotify');

    // A estrela descurte.
    await fireEvent.press(screen.getByTestId('unlike-99'));
    expect(mockSwipe).toHaveBeenCalledWith({ link_preview_id: '99', post_id: null }, false);
    await waitFor(() => expect(screen.queryByText('Get Lucky')).toBeNull());
  });

  test('buscar um gênero troca a pilha para só esse gênero', async () => {
    await wrap();
    await waitFor(() => expect(screen.getByText('One More Time')).toBeTruthy());
    mockRecs.mockResolvedValue([rec('21', 'Baile', { reason: 'genre', genre: 'funk_br', because: null })]);
    await fireEvent.changeText(screen.getByTestId('discover-genre-search'), 'fun');
    await waitFor(() => expect(screen.getByTestId('discover-genre-funk_br')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('discover-genre-funk_br'));
    await waitFor(() => expect(screen.getByText('Baile')).toBeTruthy());
    expect(mockRecs).toHaveBeenLastCalledWith('funk_br');
    expect(screen.getByText('Só Funk')).toBeTruthy();
    expect(screen.getByText('Em alta em Funk')).toBeTruthy();
  });

  test('mistura: duas sugestões para cada indicação da comunidade, sem repetir', () => {
    const a = [rec('1', 'a'), rec('2', 'b'), rec('3', 'c')];
    const b = [{ ...rec('9', 'comunidade'), source: 'community' as const }, { ...rec('2', 'repetida'), source: 'community' as const }];
    expect(mergeDeck(a, b).map((c) => c.link_preview_id)).toEqual(['1', '2', '9', '3']);
  });
});
