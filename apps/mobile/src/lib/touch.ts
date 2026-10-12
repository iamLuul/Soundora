import { Platform, type ViewStyle } from 'react-native';

type Pad = { top?: number; bottom?: number; left?: number; right?: number; vertical?: number; horizontal?: number };

/**
 * Área de toque maior sem mudar o desenho: no celular os botões pequenos usam hitSlop; a web
 * ignora hitSlop, então lá o botão ganha uma borda invisível (padding) compensada por margem
 * negativa. Resultado: alvo de ~44 px (WCAG 2.5.5) e o layout igual.
 * `base`: o padding que o botão já tem (soma em cima dele). Não use em botão com fundo,
 * borda ou tamanho fixo (o fundo cresceria junto).
 */
export function webTouch(extra = 12, base: Pad = {}): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  const side = (s: 'top' | 'bottom' | 'left' | 'right') =>
    base[s] ?? (s === 'top' || s === 'bottom' ? base.vertical : base.horizontal) ?? 0;
  return {
    paddingTop: side('top') + extra,
    paddingBottom: side('bottom') + extra,
    paddingLeft: side('left') + extra,
    paddingRight: side('right') + extra,
    marginTop: -extra,
    marginBottom: -extra,
    marginLeft: -extra,
    marginRight: -extra,
  };
}
