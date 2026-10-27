import { fireEvent, render, screen } from '@testing-library/react-native';
import ErrorRoute from '../src/app/erro/[code]';
import NotFoundScreen from '../src/app/+not-found';
import Sitemap from '../src/app/_sitemap';
import { AppError, errorStatus } from '../src/lib/errors';
import i18n from '../src/lib/i18n';

const mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: (...a: unknown[]) => mockReplace(...a), back: () => mockBack(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  await i18n.changeLanguage('pt-BR');
});

describe('telas de erro', () => {
  test('404: endereço que não existe', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByText('Página não encontrada')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('error-screen-home'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('/_sitemap vira 404 (o mapa do app não aparece)', async () => {
    await render(<Sitemap />);
    expect(screen.getByText('404')).toBeTruthy();
  });

  test.each([
    ['401', 'Você precisa entrar'],
    ['403', 'Acesso negado'],
    ['429', 'Muitas tentativas'],
    ['500', 'Algo deu errado'],
    ['503', 'Serviço indisponível'],
    ['504', 'O servidor demorou demais'],
  ])('/erro/%s', async (code, title) => {
    mockParams.code = code;
    await render(<ErrorRoute />);
    expect(screen.getByText(code)).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();
  });

  test('401 entra de novo (sai da sessão)', async () => {
    mockParams.code = '401';
    await render(<ErrorRoute />);
    await fireEvent.press(screen.getByTestId('error-screen-signin'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  test('503 tenta de novo', async () => {
    mockParams.code = '503';
    await render(<ErrorRoute />);
    await fireEvent.press(screen.getByTestId('error-screen-retry'));
    expect(mockBack).toHaveBeenCalled();
  });

  test('código desconhecido vira 404', async () => {
    mockParams.code = '418';
    await render(<ErrorRoute />);
    expect(screen.getByText('Página não encontrada')).toBeTruthy();
  });
});

describe('errorStatus', () => {
  test('converte o erro no código da tela', () => {
    expect(errorStatus(new AppError('not_authenticated'))).toBe(401);
    expect(errorStatus({ code: '42501', message: 'permission denied' })).toBe(403);
    expect(errorStatus(new AppError('not_found'))).toBe(404);
    expect(errorStatus(new AppError('rate_limited'))).toBe(429);
    expect(errorStatus(new TypeError('Failed to fetch'))).toBe(503);
    expect(errorStatus({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(504);
    expect(errorStatus({ message: 'x', context: { status: 504 } })).toBe(504);
    expect(errorStatus(new Error('boom'))).toBe(500);
  });
});
