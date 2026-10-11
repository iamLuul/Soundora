/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock exige require() dentro da fábrica */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ComposeScreen from '../src/app/(tabs)/compose';
import { CommentItem } from '../src/components/CommentItem';
import i18n from '../src/lib/i18n';
import type { CommentRow } from '../src/lib/types';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockPreview = jest.fn();
const mockCreatePost = jest.fn(async () => 'p1');
const mockNav: string[] = [];
jest.mock('expo-router', () => ({
  router: { push: (to: string) => mockNav.push(`push ${to}`), navigate: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
  useNavigation: () => ({ addListener: () => () => {}, canGoBack: () => true, goBack: () => mockNav.push('back'), isFocused: () => true }),
}));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));
jest.mock('expo-image-picker', () => ({ VideoExportPreset: { H264_1280x720: 0 } }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  previewLink: (...a: unknown[]) => mockPreview(...a),
  createPost: (...a: unknown[]) => mockCreatePost(...(a as [])),
  getMyGenres: async () => ['indie'],
  fetchGenres: async () => [
    { slug: 'rock', name_pt: 'Rock', name_en: 'Rock' },
    { slug: 'indie', name_pt: 'Indie', name_en: 'Indie' },
  ],
}));

const LINK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('pt-BR');
});

describe('Postar', () => {
  test('sem música não tem gênero; colar o link gera o card sozinho, tira o link do texto e marca os gêneros', async () => {
    mockPreview.mockResolvedValue({ id: 'lp1', url: LINK, platform: 'spotify', kind: 'track', title: 'Never Gonna', artist: 'Rick', image_url: null, genres: ['rock'] });
    await wrap(<ComposeScreen />);
    await fireEvent.changeText(screen.getByTestId('post-body'), 'só texto');
    expect(screen.queryByTestId('genre-search')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('post-body'), `ouçam ${LINK}`);
    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith(LINK));
    await waitFor(() => expect(screen.getByText('Never Gonna')).toBeTruthy());
    expect(screen.getByTestId('post-body').props.value).toBe('ouçam');
    expect(screen.getByTestId('genre-selected-rock')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('publish'));
    await waitFor(() => expect(mockCreatePost).toHaveBeenCalledWith({ body: 'ouçam', previewId: 'lp1', genres: ['rock'], media: [] }));
    // Sai da aba de postar e só então abre o post: fechar o post volta para a tela anterior.
    await waitFor(() => expect(mockNav).toEqual(['back', 'push /post/p1']));
  });

  test('tirar a música some com os gêneros', async () => {
    mockPreview.mockResolvedValue({ id: 'lp1', url: LINK, platform: 'spotify', kind: 'track', title: 'Faixa', artist: null, image_url: null, genres: ['rock'] });
    await wrap(<ComposeScreen />);
    await fireEvent.changeText(screen.getByTestId('post-body'), LINK);
    await waitFor(() => expect(screen.getByTestId('genre-search')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('remove-music'));
    expect(screen.queryByTestId('genre-search')).toBeNull();
  });
});

describe('Comentário', () => {
  const c: CommentRow = {
    id: 'c1',
    parent_id: null,
    body: 'que som',
    created_at: new Date().toISOString(),
    like_count: 3,
    reply_count: 0,
    liked_by_me: false,
    author_id: 'a',
    author_username: 'bia',
    author_display_name: 'Bia',
    author_avatar_url: null,
  };

  test('curtir e responder', async () => {
    const like = jest.fn();
    const reply = jest.fn();
    await render(<CommentItem item={c} onToggleLike={like} onReply={reply} />);
    expect(screen.getByText('3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('comment-like-c1'));
    await fireEvent.press(screen.getByTestId('comment-reply-c1'));
    expect(like).toHaveBeenCalledWith(c);
    expect(reply).toHaveBeenCalledWith(c);
  });
});
