// Termos de Uso e Política de Privacidade.
import { render, screen } from '@testing-library/react-native';
import LegalScreen from '../src/app/legal/[doc]';
import i18n from '../src/lib/i18n';
import { legalSections } from '../src/lib/legal';

let mockDoc = 'terms';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useLocalSearchParams: () => ({ doc: mockDoc }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

test('termos: título, data e as seções', async () => {
  mockDoc = 'terms';
  await render(<LegalScreen />);
  expect(screen.getByText('Termos de Uso')).toBeTruthy();
  expect(screen.getByText(/Última atualização: 7 de novembro de 2026/)).toBeTruthy();
  expect(screen.getByText('2. Quem pode usar')).toBeTruthy();
});

test('privacidade: diz que a data de nascimento não aparece e como excluir a conta', async () => {
  mockDoc = 'privacy';
  await render(<LegalScreen />);
  expect(screen.getByText('Política de Privacidade')).toBeTruthy();
  expect(screen.getByText(/Ela nunca aparece no seu perfil/)).toBeTruthy();
  expect(screen.getByText(/Configurações › Excluir conta/)).toBeTruthy();
});

test('os dois idiomas têm as mesmas seções', () => {
  for (const doc of ['terms', 'privacy', 'cookies'] as const) {
    expect(legalSections(doc, 'en').length).toBe(legalSections(doc, 'pt-BR').length);
  }
});

test('cookies: as categorias, que até escolher só o necessário é guardado e onde mudar', async () => {
  mockDoc = 'cookies';
  await render(<LegalScreen />);
  expect(screen.getByText('2. Necessários (sempre ativos)')).toBeTruthy();
  expect(screen.getByText('3. Preferências (opcional)')).toBeTruthy();
  expect(screen.getByText('4. Personalização (opcional)')).toBeTruthy();
  expect(screen.getByText(/Até você escolher, vale "Só os necessários"/)).toBeTruthy();
  expect(screen.getAllByText(/Cookies e dados do aparelho/).length).toBeGreaterThan(0);
});
