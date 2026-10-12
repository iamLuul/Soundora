// Fotos do post em tela cheia: abre na foto tocada, passa para o lado e fecha arrastando para baixo.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { MediaViewer } from '../src/components/MediaViewer';
import { PostMedia } from '../src/components/PostMedia';
import i18n from '../src/lib/i18n';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  signPostMedia: async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn.test/${p}`])),
}));

const photos = [0, 1, 2].map((i) => ({ path: `u/p${i}.jpg`, kind: 'photo' as const, width: 1080, height: 1350, duration_ms: null, position: i }));

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

test('abre na foto tocada, com contador; o X fica longe da borda', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <PostMedia media={photos as never} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('post-photo-1')).toBeTruthy());
  // Espera as URLs assinadas antes de tocar.
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await fireEvent.press(screen.getByTestId('post-photo-1'));
  expect(await screen.findByTestId('media-viewer')).toBeTruthy();
  expect(screen.getByTestId('media-viewer-counter')).toHaveTextContent('2/3');
  expect(screen.getByTestId('media-viewer-list').props.initialScrollIndex).toBe(1);

  // X abaixo da área do relógio (insets.top 44 + espaço) e afastado da lateral.
  const closeStyle = [screen.getByTestId('media-viewer-close').props.style].flat(3).reduce((a: object, b: object) => ({ ...a, ...b }), {});
  expect(closeStyle.top).toBeGreaterThan(44);
  expect(closeStyle.right).toBeGreaterThan(0);

  await fireEvent.press(screen.getByTestId('media-viewer-close'));
  await waitFor(() => expect(screen.queryByTestId('media-viewer')).toBeNull());
});

test('arrastar para o lado passa para a próxima', async () => {
  const items = photos.map((p) => ({ key: p.path, kind: 'photo' as const, uri: `https://cdn.test/${p.path}` }));
  await render(<MediaViewer items={items} index={0} onClose={jest.fn()} />);
  expect(screen.getByTestId('media-viewer-counter')).toHaveTextContent('1/3');
  await fireEvent.scroll(screen.getByTestId('media-viewer-list'), { nativeEvent: { contentOffset: { x: 750, y: 0 }, contentSize: { width: 2250, height: 800 }, layoutMeasurement: { width: 750, height: 800 } } });
  expect(screen.getByTestId('media-viewer-counter')).toHaveTextContent('2/3');
});

test('arrastar para baixo fecha; um arrasto curto não', async () => {
  jest.useFakeTimers();
  const onClose = jest.fn();
  const items = photos.map((p) => ({ key: p.path, kind: 'photo' as const, uri: `https://cdn.test/${p.path}` }));
  await render(<MediaViewer items={items} index={0} onClose={onClose} />);
  const pan = getByGestureTestId('media-viewer-pan');

  fireGestureHandler(pan, [{ state: State.BEGAN, translationY: 0 }, { state: State.ACTIVE, translationY: 40 }, { state: State.END, translationY: 40, velocityY: 100 }]);
  act(() => jest.runAllTimers());
  expect(onClose).not.toHaveBeenCalled();

  fireGestureHandler(pan, [{ state: State.BEGAN, translationY: 0 }, { state: State.ACTIVE, translationY: 220 }, { state: State.END, translationY: 220, velocityY: 300 }]);
  act(() => jest.runAllTimers());
  expect(onClose).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
