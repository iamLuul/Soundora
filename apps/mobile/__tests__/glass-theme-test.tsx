import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PLATFORM_GRADIENT } from '../src/components/figma';
import { Reactive } from '../src/components/Reactive';
import { colors, gradients } from '../src/theme';

/** Contraste WCAG entre duas cores #RRGGBB. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** `top` com opacidade `alpha` pintado sobre `base`. */
function over(top: string, alpha: number, base: string): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(ch(top, i) * alpha + ch(base, i) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('Vidro e degradês: legibilidade (WCAG AA, 4.5:1)', () => {
  test('texto branco nas duas pontas do degradê de cada plataforma', () => {
    for (const [platform, [from, to]] of Object.entries(PLATFORM_GRADIENT)) {
      expect([platform, contrast('#FFFFFF', from) >= 4.5, contrast('#FFFFFF', to) >= 4.5]).toEqual([platform, true, true]);
    }
  });

  test('texto secundário e @ sobre um cartão de vidro no ponto mais claro do fundo', () => {
    // A luz roxa do fundo (14%) com o vidro do cartão (branco a 6%) por cima.
    const card = over('#FFFFFF', 0.06, over('#685EFF', 0.14, colors.background));
    expect(contrast(colors.textMuted, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.handle, card)).toBeGreaterThanOrEqual(4.5);
  });

  test('botão principal: texto branco no roxo das duas pontas do degradê', () => {
    const stops = gradients.primary.match(/#[0-9A-Fa-f]{6}/g)!;
    expect(stops).toHaveLength(2);
    for (const stop of stops) expect(contrast('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('<Reactive />', () => {
  test('é um botão normal: toca, recebe estado de tocado e passa as props', async () => {
    const onPress = jest.fn();
    await render(
      <Reactive testID="r" accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        {({ hovered }) => <Text>{hovered ? 'em cima' : 'parado'}</Text>}
      </Reactive>,
    );
    expect(screen.getByText('parado')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('r'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
