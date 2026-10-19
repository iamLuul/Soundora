/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock exige require() dentro da fábrica */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DiscoverLiked } from '../src/components/DiscoverLiked';
import i18n from '../src/lib/i18n';
import type { LikedSong } from '../src/lib/types';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useIsFocused: () => true }));
jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: jest.fn(async () => ({ data: [], error: null })) } }));

const song = (n: number): LikedSong => ({
  link_preview_id: `id-${n}`,
  url: `https://www.deezer.com/track/${n}`,
  platform: 'deezer',
  title: `Faixa ${n}`,
  artist: 'Artista',
  album: null,
  image_url: null,
  liked_at: '',
});
let mockLiked: LikedSong[] = [];
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchLikedSongs: async () => mockLiked,
  getStreamingPlatform: async () => 'deezer',
}));

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

test('mostra 20 curtidas de cada vez (a lista chega com até 100) e o botão mostra mais', async () => {
  mockLiked = Array.from({ length: 45 }, (_, i) => song(i));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <DiscoverLiked panel />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('liked-id-0')).toBeTruthy());
  expect(screen.getByTestId('liked-id-19')).toBeTruthy();
  expect(screen.queryByTestId('liked-id-20')).toBeNull();

  await fireEvent.press(screen.getByTestId('liked-more'));
  expect(screen.getByTestId('liked-id-39')).toBeTruthy();
  expect(screen.queryByTestId('liked-id-40')).toBeNull();

  await fireEvent.press(screen.getByTestId('liked-more'));
  expect(screen.getByTestId('liked-id-44')).toBeTruthy();
  expect(screen.queryByTestId('liked-more')).toBeNull();
});
