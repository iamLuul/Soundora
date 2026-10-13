// Configurações em subtelas: o menu de categorias, conta privada, notificações, conta e acessibilidade.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import AccountSettingsScreen from '../src/app/settings/account';
import SettingsScreenIndex from '../src/app/settings/index';
import NotificationSettingsScreen from '../src/app/settings/notifications';
import PrivacySettingsScreen from '../src/app/settings/privacy';
import { parseDisplayPrefs, scaleStyles } from '../src/lib/display';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
const mockApi = {
  fetchMyAccount: jest.fn(),
  fetchFollowRequests: jest.fn(async () => []),
  fetchMutedGenres: jest.fn(async () => ['metal']),
  setPrivateAccount: jest.fn(async () => undefined),
  fetchMutedNotificationKinds: jest.fn(async () => ['follow']),
  setMutedNotificationKinds: jest.fn(async () => undefined),
  setGender: jest.fn(async () => undefined),
};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/api', () =>
  Object.fromEntries(
    [
      'fetchMyAccount',
      'fetchFollowRequests',
      'fetchMutedGenres',
      'setPrivateAccount',
      'fetchMutedNotificationKinds',
      'setMutedNotificationKinds',
      'setGender',
    ].map((name) => [name, (...args: unknown[]) => (mockApi as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args)]),
  ),
);
jest.mock('../src/lib/admin', () => ({ useIsAdmin: () => ({ data: false }) }));
jest.mock('../src/lib/push', () => ({ pushAvailability: () => ({ ok: false }), pushEnabled: () => false, enablePush: jest.fn(), disablePush: jest.fn() }));
const mockSignOut = jest.fn(async () => undefined);
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'me', username: 'luul' }, session: { user: { email: 'luul@teste.dev' } }, signOut: mockSignOut }),
}));

const account = (over = {}) => ({
  created_at: '2026-01-05T15:00:00Z',
  birthdate: '2000-03-15',
  age: 26,
  is_minor: false,
  has_guardian: false,
  gender: null,
  is_private: false,
  ...over,
});

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchMyAccount.mockResolvedValue(account());
});

test('o menu tem uma entrada por categoria, e sair pede confirmação', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
  await render(wrap(<SettingsScreenIndex />));
  for (const id of ['account', 'security', 'privacy', 'preferences', 'notifications', 'accessibility', 'about']) {
    expect(screen.getByTestId(`settings-${id}`)).toBeTruthy();
  }
  expect(screen.queryByTestId('settings-admin')).toBeNull();
  await fireEvent.press(screen.getByTestId('settings-privacy'));
  expect(mockPush).toHaveBeenCalledWith('/settings/privacy');
  await fireEvent.press(screen.getByTestId('settings-sign-out'));
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  alert.mockRestore();
});

test('Sua conta: e-mail, idade e gênero; menor de idade vê o Termo de responsáveis', async () => {
  await render(wrap(<AccountSettingsScreen />));
  expect(await screen.findByText('26 anos')).toBeTruthy();
  expect(screen.getByText('luul@teste.dev')).toBeTruthy();
  expect(screen.queryByTestId('settings-minor')).toBeNull();

  mockApi.fetchMyAccount.mockResolvedValue(account({ age: 15, is_minor: true }));
  await render(wrap(<AccountSettingsScreen />));
  expect(await screen.findByTestId('settings-minor')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('settings-minor-terms'));
  expect(mockPush).toHaveBeenCalledWith('/legal/guardians');
});

test('conta privada: confirma antes de ligar e mostra os pedidos', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
  await render(wrap(<PrivacySettingsScreen />));
  await waitFor(() => expect(screen.getByTestId('settings-private-switch').props.disabled).toBeFalsy());
  expect(screen.getByText('1 silenciado')).toBeTruthy();
  await fireEvent(screen.getByTestId('settings-private-switch'), 'valueChange', true);
  await waitFor(() => expect(mockApi.setPrivateAccount).toHaveBeenCalledWith(true));
  expect(await screen.findByTestId('settings-requests')).toBeTruthy();
  alert.mockRestore();
});

test('notificações: cada grupo liga e desliga os tipos dele', async () => {
  await render(wrap(<NotificationSettingsScreen />));
  await waitFor(() => expect(screen.getByTestId('notif-follows-switch').props.value).toBe(false));
  expect(screen.getByTestId('notif-likes-switch').props.value).toBe(true);
  await fireEvent(screen.getByTestId('notif-likes-switch'), 'valueChange', false);
  expect(mockApi.setMutedNotificationKinds).toHaveBeenCalledWith(['follow', 'like', 'comment_like', 'review_like']);
  await fireEvent(screen.getByTestId('notif-follows-switch'), 'valueChange', true);
  expect(mockApi.setMutedNotificationKinds).toHaveBeenLastCalledWith(['like', 'comment_like', 'review_like']);
});

describe('acessibilidade', () => {
  test('preferências guardadas: valores estranhos voltam ao padrão', () => {
    expect(parseDisplayPrefs(null)).toEqual({ text: 'default', icons: 'default', reduceMotion: false });
    expect(parseDisplayPrefs('{"text":"xlarge","icons":"large","reduceMotion":true}')).toEqual({ text: 'xlarge', icons: 'large', reduceMotion: true });
    expect(parseDisplayPrefs('{"text":"enorme","icons":3}')).toEqual({ text: 'default', icons: 'default', reduceMotion: false });
    expect(parseDisplayPrefs('não é json')).toEqual({ text: 'default', icons: 'default', reduceMotion: false });
  });
  test('a escala mexe só em fontSize e lineHeight', () => {
    const styles = { title: { fontSize: 20, lineHeight: 24, padding: 8 }, box: { width: 10 } };
    expect(scaleStyles(styles, 1.15)).toEqual({ title: { fontSize: 23, lineHeight: 27.6, padding: 8 }, box: { width: 10 } });
    expect(scaleStyles(styles, 1)).toBe(styles);
  });
});
