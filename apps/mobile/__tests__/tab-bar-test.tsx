import { fireEvent, render, screen } from '@testing-library/react-native';
import { rubberBand, TabBar, tabBarSpace } from '../src/components/TabBar';
import i18n from '../src/lib/i18n';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn() } }));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');
  return { isLiquidGlassAvailable: () => true, GlassView: (props: Record<string, unknown>) => <View {...props} testID="glass-view" /> };
});

const routes = ['index', 'discover', 'compose', 'music', 'me'].map((name) => ({ key: `${name}-k`, name }));
async function renderBar(index = 0) {
  const navigateToTab = jest.fn();
  const emitter = { emit: jest.fn(() => ({ defaultPrevented: false })) };
  const props = {
    state: { index, routes },
    emitter,
    navigateToTab,
    descriptors: {},
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  } as unknown as Parameters<typeof TabBar>[0];
  await render(<TabBar {...props} />);
  return { navigateToTab, emitter };
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('Barra de abas em Liquid Glass', () => {
  test('o vidro acompanha o dedo como um elástico, sem passar do limite', () => {
    expect(rubberBand(0, 9)).toBe(0);
    expect(rubberBand(20, 9)).toBeGreaterThan(0);
    expect(rubberBand(1000, 9)).toBeLessThanOrEqual(9);
    expect(rubberBand(-1000, 9)).toBeGreaterThanOrEqual(-9);
  });

  test('abas só com ícone (nome para leitor de tela), a ativa marcada; tocar troca de aba', async () => {
    const { navigateToTab } = await renderBar(0);
    expect(screen.getByTestId('tab-index').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByText('Descobrir')).toBeNull();
    expect(screen.getByLabelText('Descobrir')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tab-music'));
    expect(navigateToTab).toHaveBeenCalledWith('music-k');
  });

  test('botão de postar separado, em vidro (nativo no iOS 26)', async () => {
    const { navigateToTab } = await renderBar(0);
    expect(screen.getAllByTestId('glass-view')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('tab-compose'));
    expect(navigateToTab).toHaveBeenCalledWith('compose-k');
  });

  test('espaço que a barra flutuante cobre no fim das listas', () => {
    expect(tabBarSpace(34)).toBe(64 + 34 + 10);
    expect(tabBarSpace(0)).toBe(64 + 10 + 10);
  });
});
