import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** O vidro nativo da Apple (Liquid Glass) só existe no iOS 26 ou mais novo. */
export const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Superfície de vidro (Liquid Glass), no visual do Figma "NavBar / Liquid Glass".
 * - iOS 26+: o vidro nativo do sistema (desfoque, refração e reflexo de verdade).
 * - Web: vidro fosco do CSS (backdrop-filter) com a borda e os realces do vidro.
 * - Android e iOS antigo: sem desfoque nativo; um vidro escuro mais opaco (para o texto
 *   continuar legível em cima de qualquer conteúdo), com a mesma borda e realces.
 * `tint`: a cor da marca no botão de postar (só a tinta muda; borda e realces ficam).
 */
export function GlassSurface({
  children,
  style,
  tint,
  interactive = false,
  testID,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tinta de cor (ex.: o roxo do botão de postar). Sem ela, o vidro é incolor. */
  tint?: string;
  /** iOS 26: o vidro reage ao toque (brilha e estica um pouco). */
  interactive?: boolean;
  testID?: string;
}) {
  if (nativeGlass) {
    return (
      <GlassView testID={testID} glassEffectStyle="regular" colorScheme="dark" tintColor={tint} isInteractive={interactive} style={[styles.base, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View testID={testID} style={[styles.base, styles.fallback, tint ? { backgroundColor: tint } : null, style]}>
      {children}
    </View>
  );
}

const RIM = 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.1), inset 0 -1px 0 rgba(255,255,255,0.06)';

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  fallback: Platform.select<ViewStyle>({
    web: {
      // Tinta quase transparente: a cor vem do conteúdo atrás, desfocado.
      backgroundColor: 'rgba(90, 85, 119, 0.32)',
      backdropFilter: 'blur(18px) saturate(140%)',
      boxShadow: `0 18px 40px rgba(0,0,0,0.35), ${RIM}`,
    } as ViewStyle,
    default: {
      backgroundColor: 'rgba(58, 55, 76, 0.86)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      borderTopColor: 'rgba(255,255,255,0.32)',
      boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
    },
  })!,
});
