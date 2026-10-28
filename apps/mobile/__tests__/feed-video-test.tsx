// Vídeo na timeline: toca sozinho e sem som enquanto aparece; o alto-falante liga o som ali mesmo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PostMedia } from '../src/components/PostMedia';
import { formatClock, resetFeedMuted, VisiblePosts, VisiblePostsContext } from '../src/lib/feed-video';
import i18n from '../src/lib/i18n';

const mockPlayers: { play: jest.Mock; pause: jest.Mock; muted: boolean; loop: boolean }[] = [];
jest.mock('expo-video', () => ({
  useVideoPlayer: (_uri: string, setup: (p: object) => void) => {
    const { useState } = jest.requireActual('react');
    const [player] = useState(() => {
      const p = {
        play: jest.fn(),
        pause: jest.fn(),
        muted: false,
        loop: false,
        playing: false,
        status: 'readyToPlay',
        duration: 12,
        addListener: () => ({ remove: jest.fn() }),
      };
      setup(p);
      mockPlayers.push(p);
      return p;
    });
    return player;
  },
  VideoView: () => null,
}));
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: (_p: unknown, _e: string, initial: unknown) => initial }));
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn() } }));
jest.mock('../src/lib/api', () => ({ signPostMedia: async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn/${p}`])) }));

const video = [{ kind: 'video' as const, path: 'u/v.mp4', width: 1080, height: 1920, duration_ms: 12000 }];

async function renderVideo(visible?: VisiblePosts) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={qc}>
      <PostMedia media={video} postId="p1" />
    </QueryClientProvider>
  );
  await render(visible ? <VisiblePostsContext.Provider value={visible}>{tree}</VisiblePostsContext.Provider> : tree);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  mockPlayers.length = 0;
  resetFeedMuted();
  await i18n.changeLanguage('pt-BR');
});

test('aparece na tela: toca sozinho, sem som e em loop', async () => {
  await renderVideo();
  const p = mockPlayers[0]!;
  expect(p.muted).toBe(true);
  expect(p.loop).toBe(true);
  expect(p.play).toHaveBeenCalled();
  expect(screen.getByLabelText('Ativar o som do vídeo')).toBeTruthy();
});

test('o alto-falante liga e desliga o som sem abrir o post', async () => {
  await renderVideo();
  await fireEvent.press(screen.getByTestId('post-video-mute'));
  expect(mockPlayers[0]!.muted).toBe(false);
  expect(screen.getByLabelText('Desativar o som do vídeo')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('post-video-mute'));
  expect(mockPlayers[0]!.muted).toBe(true);
});

test('fora da tela não baixa nem toca; ao aparecer, começa; ao sair, pausa', async () => {
  const visible = new VisiblePosts();
  await renderVideo(visible);
  expect(mockPlayers).toHaveLength(0);
  expect(screen.getByTestId('post-video-play')).toBeTruthy();

  await act(async () => visible.update([{ id: 'p1', visible: true }]));
  const p = mockPlayers[0]!;
  expect(p.play).toHaveBeenCalled();

  await act(async () => visible.update([{ id: 'p1', visible: false }]));
  expect(p.pause).toHaveBeenCalled();
});

test('tempo que falta no formato do relógio', () => {
  expect(formatClock(7.2)).toBe('0:07');
  expect(formatClock(83)).toBe('1:23');
  expect(formatClock(-1)).toBe('0:00');
});
