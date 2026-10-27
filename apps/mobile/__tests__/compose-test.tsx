/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock exige require() dentro da fábrica */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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
let mockCommunities: unknown[] = [];
jest.mock('expo-router', () => ({
  router: { push: (to: string) => mockNav.push(`push ${to}`), navigate: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
  useNavigation: () => ({ addListener: () => () => {}, canGoBack: () => true, goBack: () => mockNav.push('back'), isFocused: () => true }),
  useLocalSearchParams: () => mockParams,
}));
const mockParams: Record<string, string> = {};
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
  fetchMyCommunities: async () => mockCommunities,
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
  mockCommunities = [];
  for (const k of Object.keys(mockParams)) delete mockParams[k];
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
    await waitFor(() => expect(mockCreatePost).toHaveBeenCalledWith({ body: 'ouçam', previewId: 'lp1', genres: ['rock'], media: [], communityId: null }));
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

  test('resposta presa ao comentário por uma linha vertical; divisória só no fim da conversa', async () => {
    const border = (id: string) => StyleSheet.flatten(screen.getByTestId(`comment-${id}`).props.style).borderBottomWidth ?? 0;
    const r1 = { ...c, id: 'r1', parent_id: 'c1' };
    const r2 = { ...c, id: 'r2', parent_id: 'c1' };
    await render(
      <>
        <CommentItem item={c} onToggleLike={jest.fn()} onReply={jest.fn()} continues />
        <CommentItem item={r1} onToggleLike={jest.fn()} onReply={jest.fn()} continues />
        <CommentItem item={r2} onToggleLike={jest.fn()} onReply={jest.fn()} />
      </>,
    );
    expect(['c1', 'r1', 'r2'].map((id) => !!screen.queryByTestId(`thread-line-${id}`))).toEqual([true, true, true]);
    expect(['c1', 'r1', 'r2'].map(border)).toEqual([0, 0, 1]);
  });

  test('comentário sem respostas: sem linha, com divisória', async () => {
    await render(<CommentItem item={c} onToggleLike={jest.fn()} onReply={jest.fn()} />);
    expect(screen.queryByTestId('thread-line-c1')).toBeNull();
  });

  test('postar numa comunidade: escolher onde publicar (ou já vir escolhida da comunidade)', async () => {
    mockCommunities = [{ id: 'c1', slug: 'fas', name: 'Fãs da Banda', color: 0, visibility: 'open', role: 'member', member_count: 3 }];
    Object.assign(mockParams, { community: 'c1' });
    await wrap(<ComposeScreen />);
    expect(await screen.findByText('Publicar só na comunidade Fãs da Banda')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('post-body'), 'oi comunidade');
    await fireEvent.press(screen.getByTestId('publish'));
    await waitFor(() => expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ body: 'oi comunidade', communityId: 'c1' })));
  });

  test('sem comunidade escolhida, o post é geral', async () => {
    mockCommunities = [{ id: 'c1', slug: 'fas', name: 'Fãs da Banda', color: 0, visibility: 'open', role: 'member', member_count: 3 }];
    await wrap(<ComposeScreen />);
    await fireEvent.press(await screen.findByTestId('destination-fas'));
    await fireEvent.press(screen.getByTestId('destination-general'));
    expect(screen.getByText('Publicar no seu perfil e na timeline')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('post-body'), 'geral');
    await fireEvent.press(screen.getByTestId('publish'));
    await waitFor(() => expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ communityId: null })));
  });
});
