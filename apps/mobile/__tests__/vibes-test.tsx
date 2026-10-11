import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NewVibeScreen from '../src/app/vibes/new';
import { FollowingRow } from '../src/components/FollowingRow';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
const mockCreate = jest.fn(async () => 'v1');
const mockParams: Record<string, string> = {};
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: () => ({ isPlaying: false }) }));
jest.mock('expo-image-picker', () => ({ VideoExportPreset: { H264_1280x720: 0 } }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  createVibe: (...a: unknown[]) => mockCreate(...(a as [])),
  fetchFollowing: async () => [
    { username: 'bia', display_name: 'Bia', avatar_url: null },
    { username: 'caio', display_name: 'Caio', avatar_url: null },
  ],
  fetchVibesTray: async () => [
    { author_id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null, vibe_count: 1, unseen: false, latest_at: '', is_me: true },
    { author_id: 'b', username: 'bia', display_name: 'Bia', avatar_url: null, vibe_count: 2, unseen: true, latest_at: '', is_me: false },
  ],
  fetchUnreadNotifications: async () => 0,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  await i18n.changeLanguage('pt-BR');
});

describe('Nova vibe', () => {
  test('texto com cor de fundo', async () => {
    await wrap(<NewVibeScreen />);
    expect(screen.getByTestId('vibe-publish').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'bom dia');
    await fireEvent.press(screen.getByTestId('vibe-style-pink'));
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'text', text: 'bom dia', style: 'pink' }));
  });

  test('compartilhar um post: abre já com o post e publica como vibe de post', async () => {
    Object.assign(mockParams, { postId: 'p1', postUser: 'bia', postBody: 'ouçam', postUrl: 'https://open.spotify.com/track/x', postPlatform: 'spotify', postTitle: 'Faixa' });
    await wrap(<NewVibeScreen />);
    expect(screen.getByText('@bia')).toBeTruthy();
    expect(screen.queryByTestId('vibe-mode-text')).toBeNull();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'post', postId: 'p1', text: '', style: 'violet' }));
  });
});

describe('Fila de Vibes na Home', () => {
  test('eu primeiro, depois quem tem vibe, depois quem não tem; abrir leva a fila', async () => {
    await wrap(<FollowingRow />);
    await waitFor(() => expect(screen.getByTestId('vibe-bia')).toBeTruthy());
    expect(screen.getByLabelText('@caio')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vibe-bia'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/vibes/[author]', params: { author: 'b', queue: '' } });
    await fireEvent.press(screen.getByTestId('vibe-new'));
    expect(mockPush).toHaveBeenCalledWith('/vibes/new');
  });
});
