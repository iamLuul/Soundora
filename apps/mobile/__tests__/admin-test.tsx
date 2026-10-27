// Painel admin: só abre para admin; denúncias, usuários e o aviso de conta suspensa.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AdminScreen from '../src/app/admin';
import { SuspendedBanner } from '../src/components/SuspendedBanner';
import { isSuspended } from '../src/lib/admin';
import i18n from '../src/lib/i18n';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));

let mockIsAdmin = true;
let mockProfile: Record<string, unknown> | null = null;
const mockRpc = jest.fn(async (name: string, _args?: unknown) => {
  switch (name) {
    case 'is_admin':
      return { data: mockIsAdmin, error: null };
    case 'admin_overview':
      return { data: [{ open_reports: 1, suspended: 0, verified: 2, featured_active: 3 }], error: null };
    case 'admin_reports':
      return {
        data: [
          {
            target_type: 'post', target_id: 'p1', report_count: 2, reasons: ['hate', 'spam'], details: ['xingou'], latest_at: '2026-10-12T12:00:00Z',
            status: 'open', exists_now: true, preview: 'conteúdo ofensivo', post_id: 'p1', author_id: 'u9', author_username: 'troll',
            author_avatar_url: null, author_suspended_until: null,
          },
        ],
        error: null,
      };
    case 'admin_users':
      return {
        data: [{ id: 'u9', username: 'troll', display_name: 'Troll', avatar_url: null, verified: false, suspended_until: null, is_admin: false, created_at: '', post_count: 3, open_reports: 2, follower_count: 12 }],
        error: null,
      };
    default:
      return { data: null, error: null };
  }
});
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), order: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
  },
  supabaseUrl: 'http://localhost:54321',
}));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: mockProfile }) }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  mockRpc.mockClear();
  mockIsAdmin = true;
  // Confirmações: aperta o botão de confirmar.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
});

test('quem não é admin vê a tela 403', async () => {
  mockIsAdmin = false;
  await wrap(<AdminScreen />);
  expect(await screen.findByText('Acesso negado')).toBeTruthy();
  expect(screen.getByText('403')).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalledWith('admin_reports', expect.anything());
});

test('denúncias: mostra o conteúdo e os motivos; dispensar chama o banco', async () => {
  await wrap(<AdminScreen />);
  expect(await screen.findByText('conteúdo ofensivo')).toBeTruthy();
  expect(screen.getByText('Discurso de ódio · Spam')).toBeTruthy();
  expect(screen.getByText('2 denúncias')).toBeTruthy();
  expect(screen.getByTestId('admin-overview')).toHaveTextContent(/Abertas: 1/);
  await fireEvent.press(screen.getByTestId('report-dismiss-p1'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_resolve', { p_target_type: 'post', p_target_id: 'p1', p_action: 'dismiss' }));
});

test('usuários: verificar e suspender', async () => {
  await wrap(<AdminScreen />);
  await fireEvent.press(await screen.findByTestId('tab-users'));
  await fireEvent.press(await screen.findByTestId('admin-verify-troll'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_set_verified', { p_user: 'u9', p_verified: true }));
  await fireEvent.press(screen.getByTestId('admin-suspend-troll'));
  await fireEvent.press(await screen.findByTestId('option-suspend-7'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_suspend', { p_user: 'u9', p_days: 7 }));
});

test('usuários: filtros e ordenação vão para o banco', async () => {
  await wrap(<AdminScreen />);
  await fireEvent.press(await screen.findByTestId('tab-users'));
  expect(await screen.findByText(/12 seguidores/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('admin-filter-verified'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_users', expect.objectContaining({ p_filter: 'verified', p_sort: 'relevance' })));
  await fireEvent.press(screen.getByTestId('admin-sort'));
  await fireEvent.press(await screen.findByTestId('option-sort-name_desc'));
  await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_users', expect.objectContaining({ p_filter: 'verified', p_sort: 'name_desc' })));
  expect(screen.getByTestId('admin-sort')).toHaveTextContent(/Z a A/);
});

test('aviso de conta suspensa', async () => {
  mockProfile = { id: 'me', suspended_until: '2999-01-01T00:00:00Z' };
  await wrap(<SuspendedBanner />);
  expect(screen.getByTestId('suspended-banner')).toBeTruthy();
  mockProfile = { id: 'me', suspended_until: null };
  await wrap(<SuspendedBanner />);
  expect(screen.queryByTestId('suspended-banner')).toBeNull();
  expect(isSuspended('infinity')).toBe(true);
  expect(isSuspended('2000-01-01T00:00:00Z')).toBe(false);
});

test('zero no plural: "nenhuma denúncia aberta", "nenhum post"', () => {
  expect(i18n.t('admin.openReports', { count: 0 })).toBe('nenhuma denúncia aberta');
  expect(i18n.t('admin.openReports', { count: 1 })).toBe('1 denúncia aberta');
  expect(i18n.t('admin.posts', { count: 2 })).toBe('2 posts');
});

test('fileira de filtros não estica: não cresce na coluna e os botões ficam centralizados', async () => {
  const { StyleSheet } = jest.requireActual('react-native');
  await wrap(<AdminScreen />);
  await fireEvent.press(await screen.findByTestId('tab-users'));
  const chip = await screen.findByTestId('admin-filter-all');
  expect(StyleSheet.flatten(chip.props.style)).toMatchObject({ alignSelf: 'center' });
  let node = chip.parent;
  while (node && !(node.props?.horizontal)) node = node.parent;
  expect(StyleSheet.flatten(node!.props.style)).toMatchObject({ flexGrow: 0 });
});
