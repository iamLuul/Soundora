// Selos do perfil (só exibição), o selo grande ao tocar, a aba Selos do painel e o apoio só na web.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform } from 'react-native';
import AdminScreen from '../src/app/admin';
import { ProfileBadges } from '../src/components/ProfileBadges';
import { SupportCard } from '../src/components/SupportLink';
import i18n from '../src/lib/i18n';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'admin' } }) }));

const EARLY = {
  slug: 'early_supporter',
  icon: 'early_supporter',
  name_pt: 'Contribuidor inicial',
  name_en: 'Early supporter',
  description_pt: 'Apoiou o Soundhora no começo.',
  description_en: 'Supported Soundhora early.',
  granted_at: '2026-10-19T15:00:00Z',
  limited: false,
};
const ADMIN_BADGE = {
  id: 'b1',
  slug: 'early_supporter',
  icon: 'early_supporter',
  name_pt: 'Contribuidor inicial',
  name_en: 'Early supporter',
  description_pt: 'Apoiou o Soundhora no começo.',
  description_en: 'Supported Soundhora early.',
  award: 'manual',
  grants_open: true,
  available_until: null,
  grantable: true,
  retired: false,
  holders: 1,
};
let mockBadges: unknown[] = [EARLY];
let mockSupportUrl: string | null = 'https://www.patreon.com/soundhora';
const mockRpc = jest.fn(async (name: string, _args?: unknown) => {
  switch (name) {
    case 'profile_badges':
      return { data: mockBadges, error: null };
    case 'is_admin':
      return { data: true, error: null };
    case 'admin_overview':
      return { data: [{ open_reports: 0, suspended: 0, verified: 0, featured_active: 0 }], error: null };
    case 'admin_badges':
      return { data: [ADMIN_BADGE], error: null };
    case 'admin_badge_holders':
      return { data: [{ user_id: 'u1', username: 'ana', display_name: 'Ana', avatar_url: null, granted_at: '2026-10-19T15:00:00Z' }], error: null };
    default:
      return { data: [], error: null };
  }
});
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
    from: () => ({
      select: () => ({
        single: async () => ({ data: { support_url: mockSupportUrl }, error: null }),
        eq: () => ({ limit: async () => ({ data: [], error: null }) }),
        order: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }),
    }),
  },
  supabaseUrl: 'http://localhost:54321',
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  mockRpc.mockClear();
  mockBadges = [EARLY];
  mockSupportUrl = 'https://www.patreon.com/soundhora';
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
});
afterEach(() => jest.restoreAllMocks());

describe('selos no perfil', () => {
  test('fileira de selos; tocar abre o selo grande com nome, data e descrição', async () => {
    await wrap(<ProfileBadges userId="u1" />);
    await waitFor(() => expect(screen.getByTestId('badge-early_supporter')).toBeTruthy());
    expect(mockRpc).toHaveBeenCalledWith('profile_badges', { p_user: 'u1' });
    expect(screen.getByText('Selos')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('badge-early_supporter'));
    expect(screen.getByTestId('badge-overlay')).toBeTruthy();
    expect(screen.getByText('Contribuidor inicial')).toBeTruthy();
    expect(screen.getByText('Recebido em 19 de outubro de 2026')).toBeTruthy();
    expect(screen.getByText('Apoiou o Soundhora no começo.')).toBeTruthy();
    expect(screen.queryByText(/Selo limitado/)).toBeNull();
    // No app (não web), nada de doação.
    expect(screen.queryByTestId('badge-support')).toBeNull();
    await fireEvent.press(screen.getByTestId('badge-close'));
    expect(screen.queryByTestId('badge-overlay')).toBeNull();
  });

  test('selo limitado aparece marcado', async () => {
    mockBadges = [{ ...EARLY, limited: true }];
    await wrap(<ProfileBadges userId="u1" />);
    await waitFor(() => expect(screen.getByTestId('badge-early_supporter')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('badge-early_supporter'));
    expect(screen.getByText('Selo limitado: não pode mais ser conquistado')).toBeTruthy();
  });

  test('sem selos, nada', async () => {
    mockBadges = [];
    await wrap(<ProfileBadges userId="u2" />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('profile_badges', { p_user: 'u2' }));
    expect(screen.queryByTestId('profile-badges')).toBeNull();
  });
});

describe('apoio (Patreon)', () => {
  test('nos apps não aparece', async () => {
    await wrap(<SupportCard />);
    expect(screen.queryByTestId('panel-support')).toBeNull();
  });

  test('na web aparece com o link do banco e abre o Patreon', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await wrap(<SupportCard />);
    await waitFor(() => expect(screen.getByTestId('panel-support')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('panel-support-link'));
    expect(open).toHaveBeenCalledWith('https://www.patreon.com/soundhora');
  });

  test('na web, sem link configurado (ou link que não é do Patreon), não aparece', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockSupportUrl = 'https://evil.example/patreon.com/x';
    await wrap(<SupportCard />);
    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
    expect(screen.queryByTestId('panel-support')).toBeNull();
  });
});

describe('painel admin: selos', () => {
  test('conceder pelo @, ver quem tem, tirar, pausar e encerrar para sempre', async () => {
    await wrap(<AdminScreen />);
    await waitFor(() => expect(screen.getByText('Selos')).toBeTruthy());
    await fireEvent.press(screen.getByText('Selos'));
    await waitFor(() => expect(screen.getByTestId('admin-badge-early_supporter')).toBeTruthy());
    expect(screen.getByText('Aberto')).toBeTruthy();
    expect(screen.getByText('1 pessoa tem')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('badge-grant-user-early_supporter'), '@bia');
    await fireEvent.press(screen.getByTestId('badge-grant-early_supporter'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_grant_badge', { p_badge: 'b1', p_username: '@bia' }));

    await fireEvent.press(screen.getByTestId('badge-holders-early_supporter'));
    await waitFor(() => expect(screen.getByText(/@ana/)).toBeTruthy());
    await fireEvent.press(screen.getAllByText('Remover').at(-1)!);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_revoke_badge', { p_badge: 'b1', p_user: 'u1' }));

    await fireEvent.press(screen.getByTestId('badge-toggle-early_supporter'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_set_badge_open', { p_badge: 'b1', p_open: false }));

    await fireEvent.press(screen.getByTestId('badge-retire-early_supporter'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_set_badge_until', { p_badge: 'b1', p_until: expect.any(String) }));
  });
});
