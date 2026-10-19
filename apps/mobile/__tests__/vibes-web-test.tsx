import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import NewVibeScreen from '../src/app/vibes/new';
import { FollowingRow } from '../src/components/FollowingRow';
import { PostActions } from '../src/components/PostActions';
import i18n from '../src/lib/i18n';

// Na web só dá para ver vibes: nada de criar.
jest.mock('../src/lib/vibes-create', () => ({ canCreateVibes: false }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return {
    Stack: { Screen: () => null },
    Redirect: ({ href }: { href: string }) => <T testID="redirect">{href}</T>,
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: () => ({ isPlaying: false }) }));
jest.mock('expo-image-picker', () => ({ VideoExportPreset: { H264_1280x720: 0 } }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }) }));

let mockTray: unknown[] = [];
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchVibesTray: async () => mockTray,
  fetchUnreadNotifications: async () => 0,
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const person = (id: string, username: string, is_me = false) => ({
  author_id: id,
  username,
  display_name: username,
  avatar_url: null,
  vibe_count: 1,
  unseen: true,
  latest_at: '',
  is_me,
});

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('Vibes na web: só visualizar', () => {
  test('a tela de criar manda de volta para o início', async () => {
    await wrap(<NewVibeScreen />);
    expect(screen.getByTestId('redirect').props.children).toBe('/');
    expect(screen.queryByTestId('vibe-publish')).toBeNull();
  });

  test('menu do post: sem "Compartilhar nas Vibes"', async () => {
    await wrap(<PostActions visible username="bia" isMine={false} onClose={() => undefined} onAction={() => undefined} />);
    expect(await screen.findByText(i18n.t('feed.report'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('vibes.shareToVibes'))).toBeNull();
  });

  test('fila: sem "+" e sem "Você" quando não tenho vibe; com vibe, dá para ver a minha', async () => {
    mockTray = [person('b', 'bia')];
    const first = await wrap(<FollowingRow />);
    await waitFor(() => expect(screen.getByTestId('vibe-bia')).toBeTruthy());
    expect(screen.queryByTestId('vibe-me')).toBeNull();
    expect(screen.queryByTestId('vibe-new')).toBeNull();
    first.unmount();

    mockTray = [person('me', 'raul', true), person('b', 'bia')];
    await wrap(<FollowingRow />);
    await waitFor(() => expect(screen.getByTestId('vibe-me')).toBeTruthy());
    expect(screen.queryByTestId('vibe-new')).toBeNull();
  });
});
