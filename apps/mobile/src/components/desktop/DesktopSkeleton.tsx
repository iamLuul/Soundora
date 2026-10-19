import { StyleSheet, View } from 'react-native';
import { useWebLayout } from '../../lib/layout';
import { colors, space } from '../../theme';
import { AppSkeleton, Bone, Skeleton } from '../Skeleton';
import { CENTER_WIDTH } from './DesktopShell';

const repeat = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * Esqueleto do app abrindo (fontes e sessão), no formato da tela: no desktop, a barra lateral,
 * a coluna do meio e (em tela larga) a coluna da direita, nas mesmas medidas do DesktopShell;
 * no celular (e abaixo de 960 px), o esqueleto de celular.
 */
export function BootSkeleton() {
  const layout = useWebLayout();
  if (layout === 'mobile') return <AppSkeleton />;
  return <DesktopAppSkeleton wide={layout === 'wide'} />;
}

export function DesktopAppSkeleton({ wide }: { wide: boolean }) {
  return (
    <Skeleton testID="skeleton-app-desktop" style={styles.root}>
      <SidebarBones />
      <View style={styles.center}>
        <View style={styles.tabs}>
          <Bone width={72} height={14} />
          <Bone width={72} height={14} />
        </View>
        <View style={styles.vibes}>
          {repeat(7).map((i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <Bone circle size={62} />
              <Bone width={44} height={8} />
            </View>
          ))}
        </View>
        {repeat(3).map((i) => (
          <View key={i} style={styles.post}>
            <View style={styles.row}>
              <Bone circle size={42} />
              <View style={{ gap: 6, flex: 1 }}>
                <Bone width="32%" height={12} />
                <Bone width="18%" height={9} />
              </View>
            </View>
            <Bone width="94%" />
            <Bone width={i % 2 ? '58%' : '72%'} />
            {i !== 2 ? <Bone height={88} radius={12} /> : null}
            <View style={[styles.row, { gap: space.xl }]}>
              <Bone width={40} height={14} />
              <Bone width={40} height={14} />
              <Bone width={24} height={14} />
              <Bone width={48} height={10} style={{ marginLeft: 'auto' }} />
            </View>
          </View>
        ))}
      </View>
      {wide ? <PanelBones /> : null}
    </Skeleton>
  );
}

/** Barra lateral: logo, as seis seções, o botão Postar e a conta embaixo. */
function SidebarBones() {
  return (
    <View style={styles.sidebar}>
      <Bone width={150} height={64} radius={12} style={{ marginLeft: 12, marginBottom: space.lg }} />
      <View style={{ gap: 6 }}>
        {repeat(6).map((i) => (
          <View key={i} style={styles.navItem}>
            <Bone circle size={28} />
            <Bone width={i % 2 ? 90 : 70} height={14} />
          </View>
        ))}
      </View>
      <Bone height={40} radius={20} style={{ marginTop: space.xxl }} />
      <View style={{ flex: 1 }} />
      <View style={styles.account}>
        <Bone circle size={40} />
        <View style={{ flex: 1, gap: 6 }}>
          <Bone width="70%" height={11} />
          <Bone width="45%" height={8} />
        </View>
      </View>
    </View>
  );
}

/** Coluna da direita: busca, contas para seguir, mais ouvidas e o rodapé. */
function PanelBones() {
  return (
    <View style={styles.panel}>
      <Bone height={42} radius={21} />
      <View style={{ gap: space.md }}>
        <Bone width={150} height={14} />
        {repeat(3).map((i) => (
          <View key={i} style={styles.row}>
            <Bone circle size={44} />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone width={i % 2 ? '50%' : '65%'} height={12} />
              <Bone width="35%" height={10} />
            </View>
            <Bone width={72} height={30} radius={15} />
          </View>
        ))}
      </View>
      <View style={{ gap: space.md }}>
        <Bone width={170} height={14} />
        {repeat(5).map((i) => (
          <View key={i} style={styles.row}>
            <Bone width={14} height={14} />
            <Bone size={44} radius={8} />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone width={i % 2 ? '55%' : '75%'} height={12} />
              <Bone width="40%" height={10} />
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.row, { flexWrap: 'wrap', gap: space.md }]}>
        {repeat(4).map((i) => (
          <Bone key={i} width={52} height={9} />
        ))}
      </View>
    </View>
  );
}

// Medidas iguais às do DesktopShell, Sidebar e RightPanel (a tela não "pula" quando o app abre).
const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', justifyContent: 'center', backgroundColor: colors.background, overflow: 'hidden' },
  sidebar: { width: 232, flexShrink: 0, paddingTop: 26, paddingBottom: space.xl, paddingRight: space.lg, height: '100%' },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 48, paddingHorizontal: space.sm },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 50, borderRadius: 25, paddingLeft: 5, paddingRight: space.lg },
  center: {
    width: CENTER_WIDTH,
    flexShrink: 0,
    height: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.tabBar,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    gap: space.md,
    overflow: 'hidden',
  },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: space.xl },
  vibes: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  post: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  panel: { width: 340, flexShrink: 0, height: '100%', paddingTop: 40, paddingLeft: space.xl, gap: space.xl, overflow: 'hidden' },
});
