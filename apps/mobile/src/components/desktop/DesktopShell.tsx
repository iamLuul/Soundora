import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useWebLayout } from '../../lib/layout';
import { Backdrop } from '../Backdrop';
import { RightPanel } from './RightPanel';
import { Sidebar } from './Sidebar';

/** Largura da coluna do meio (Figma: 648 px entre as duas linhas). */
export const CENTER_WIDTH = 648;

/**
 * Moldura do desktop na web (Figma: Home e Discover, 1440 px): barra lateral, a tela atual no
 * meio e, em telas largas, a coluna da direita. Só depois do login e do onboarding (`enabled`):
 * antes disso nada aqui é montado, então nenhuma consulta sai sem sessão.
 * A árvore é sempre a mesma (só some/aparece o que fica dos lados): redimensionar a janela não
 * desmonta a navegação.
 */
export function DesktopShell({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const layout = useWebLayout();
  const desktop = enabled && layout !== 'mobile';
  return (
    <Backdrop style={desktop ? styles.rootDesktop : undefined}>
      {desktop ? <Sidebar /> : null}
      <View style={desktop ? styles.center : styles.full}>{children}</View>
      {desktop && layout === 'wide' ? <RightPanel /> : null}
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  rootDesktop: { flexDirection: 'row', justifyContent: 'center' },
  full: { flex: 1 },
  center: {
    width: CENTER_WIDTH,
    flexShrink: 0,
    height: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(179, 169, 235, 0.16)',
    // As abas deslizam (carrossel): sem isto, a aba vizinha apareceria por cima das colunas.
    overflow: 'hidden',
  },
});
