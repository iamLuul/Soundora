import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, gradients } from '../theme';

/**
 * Fundo das telas: o "Plush" do Soundhora com três luzes suaves (roxo, rosa e ciano). É o que o
 * vidro dos cartões e barras deixa ver; sem ele o vidro vira uma caixa cinza.
 * Na web as luzes ficam presas à janela (não rolam com a página), então a barra lateral, a
 * coluna do meio e a da direita mostram o mesmo fundo contínuo.
 * `headed`: a tela tem a barra de título do sistema (lisa) em cima; sem a luz do topo.
 */
export function Backdrop({ children, style, headed = false }: { children?: ReactNode; style?: ViewStyle; headed?: boolean }) {
  return (
    <View style={[styles.root, style]}>
      <View pointerEvents="none" style={[styles.light, headed && styles.headed]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  light: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: gradients.backdrop,
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as unknown as ViewStyle) : null),
  },
  headed: { backgroundImage: gradients.backdropHeaded },
});
