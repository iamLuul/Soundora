// Cookies e dados do aparelho (LGPD): até escolher, só o necessário; o opcional só com o "sim";
// desligar apaga; aviso com "aceitar" e "recusar" do mesmo jeito; escolha registrada na conta.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import CookiesScreen from '../src/app/cookies';
import { CookieConsent } from '../src/components/CookieConsent';
import { allows, getConsent, resetConsentForTests, saveConsent, storedGet, storedSet } from '../src/lib/consent';
import i18n from '../src/lib/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const Banner = () => (
  <SafeAreaProvider initialMetrics={metrics}>
    <CookieConsent />
  </SafeAreaProvider>
);

const mockRecord = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../src/lib/api', () => ({ recordCookieConsent: (...a: unknown[]) => mockRecord(...a) }));
let mockUser: string | null = null;
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ session: mockUser ? { user: { id: mockUser } } : null, profile: mockUser ? { id: mockUser } : null }),
}));
let mockPath = '/sign-in';
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, usePathname: () => mockPath, Stack: { Screen: () => null } }));
jest.mock('../src/components/Toast', () => ({ showToast: jest.fn() }));

const ls = () => globalThis.localStorage!;

beforeEach(async () => {
  ls().clear();
  resetConsentForTests();
  mockRecord.mockClear();
  mockUser = null;
  mockPath = '/sign-in';
  await i18n.changeLanguage('pt-BR');
});

describe('regras de gravação', () => {
  test('até escolher: necessários gravam; opcionais ficam só na memória', () => {
    expect(getConsent()).toBeNull();
    expect(allows('necessary')).toBe(true);
    expect(allows('preferences')).toBe(false);
    storedSet('preferences', 'soundora.display', '{"text":"large"}');
    expect(storedGet('preferences', 'soundora.display')).toBe('{"text":"large"}');
    expect(ls().getItem('soundora.display')).toBeNull();
  });

  test('aceitar grava o que estava na memória; desligar apaga do aparelho na hora', () => {
    storedSet('personalization', 'soundhora.seen-posts', '[["p1",1]]');
    saveConsent({ preferences: true, personalization: true });
    expect(ls().getItem('soundhora.seen-posts')).toBe('[["p1",1]]');
    ls().setItem('soundora.tip.discover', '1');
    saveConsent({ preferences: false, personalization: true });
    expect(ls().getItem('soundora.tip.discover')).toBeNull();
    expect(ls().getItem('soundhora.seen-posts')).toBe('[["p1",1]]');
    // A sessão (necessária) nunca é apagada pela escolha.
    ls().setItem('sb-proj-auth-token', 'x');
    saveConsent({ preferences: false, personalization: false });
    expect(ls().getItem('sb-proj-auth-token')).toBe('x');
    expect(ls().getItem('soundhora.seen-posts')).toBeNull();
  });
});

describe('aviso da primeira visita (só na web)', () => {
  const realOS = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'web';
  });
  afterEach(() => {
    Platform.OS = realOS;
  });

  test('no app do celular não aparece (a escolha é feita ao criar a conta e em Configurações)', async () => {
    Platform.OS = 'android';
    await render(<Banner />);
    expect(screen.queryByTestId('cookie-consent')).toBeNull();
  });

  test('aparece até escolher; "Só os necessários" fecha sem gravar nada opcional', async () => {
    await render(<Banner />);
    expect(screen.getByTestId('cookie-consent')).toBeTruthy();
    // Aceitar e recusar com o mesmo peso, lado a lado.
    expect(screen.getByText('Aceitar todos')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cookie-only-necessary'));
    expect(screen.queryByTestId('cookie-consent')).toBeNull();
    expect(getConsent()).toMatchObject({ preferences: false, personalization: false });
    // Sem login: nada vai para o servidor.
    expect(mockRecord).not.toHaveBeenCalled();
  });

  test('com login, a escolha é registrada na conta (uma vez)', async () => {
    mockUser = 'u1';
    await render(<Banner />);
    await fireEvent.press(screen.getByTestId('cookie-accept-all'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0]![0]).toMatchObject({ preferences: true, personalization: true, version: 1 });
    expect(getConsent()?.synced).toEqual(['u1']);
  });

  test('não aparece na própria tela de cookies nem nas políticas', async () => {
    mockPath = '/legal/cookies';
    await render(<Banner />);
    expect(screen.queryByTestId('cookie-consent')).toBeNull();
  });
});

describe('tela Cookies e dados do aparelho', () => {
  test('lista o que está guardado, liga uma categoria e salva', async () => {
    ls().setItem('sb-proj-auth-token', '{"a":1}');
    await render(<CookiesScreen />);
    expect(screen.getByText('Você ainda não escolheu. Até escolher, só o necessário é guardado.')).toBeTruthy();
    expect(screen.getByTestId('cookie-item-session')).toBeTruthy();
    expect(screen.getAllByText(/guardado agora/).length).toBeGreaterThan(0);
    await fireEvent(screen.getByTestId('cookie-switch-preferences'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('cookie-save'));
    expect(getConsent()).toMatchObject({ preferences: true, personalization: false });
  });

  test('apagar remove preferências e personalização, mas mantém o login', async () => {
    saveConsent({ preferences: true, personalization: true });
    ls().setItem('soundora.display', '{}');
    ls().setItem('soundhora.seen-posts', '[]');
    ls().setItem('sb-proj-auth-token', 'x');
    await render(<CookiesScreen />);
    await fireEvent.press(screen.getByTestId('cookie-clear'));
    expect(ls().getItem('soundora.display')).toBeNull();
    expect(ls().getItem('soundhora.seen-posts')).toBeNull();
    expect(ls().getItem('sb-proj-auth-token')).toBe('x');
  });
});
