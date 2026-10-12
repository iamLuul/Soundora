import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../theme';

/**
 * Skeleton screens: blocos no formato do conteúdo, pulsando de leve enquanto ele carrega.
 * Um <Skeleton> dá o pulso (um só, para todos os blocos dentro pulsarem juntos) e avisa
 * o leitor de tela que está carregando; os <Bone> são os blocos.
 */

const Pulse = createContext<Animated.Value | null>(null);

/** Cor dos blocos: um tom acima do fundo, como os cartões do Figma. */
const BONE = colors.surface;

export function Skeleton({ children, style, testID = 'skeleton' }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { t } = useTranslation();
  const [opacity] = useState(() => new Animated.Value(0.55));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduceMotion(!!v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || process.env.NODE_ENV === 'test') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Pulse.Provider value={opacity}>
      <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} accessibilityState={{ busy: true }} style={style}>
        {children}
      </View>
    </Pulse.Provider>
  );
}

/** Um bloco do esqueleto. `circle` = redondo com o tamanho de `size`. */
export function Bone({
  width = '100%',
  height = 12,
  size,
  circle = false,
  radius: r = 6,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  size?: number;
  circle?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useContext(Pulse);
  const w = size ?? width;
  const h = size ?? height;
  return <Animated.View style={[{ width: w, height: h, borderRadius: circle && size ? size / 2 : r, backgroundColor: BONE }, opacity ? { opacity } : { opacity: 0.7 }, style]} />;
}

const repeat = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Post do feed: autor, texto, cartão da música e ações. */
export function PostSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Skeleton testID="skeleton-posts">
      {repeat(count).map((i) => (
        <View key={i} style={styles.post}>
          <View style={styles.row}>
            <Bone circle size={38} />
            <View style={{ gap: 6, flex: 1 }}>
              <Bone width="40%" height={11} />
              <Bone width="25%" height={9} />
            </View>
          </View>
          <Bone width="92%" />
          <Bone width={i % 2 ? '55%' : '70%'} />
          {i % 3 !== 2 ? <Bone height={76} radius={10} /> : null}
          <View style={[styles.row, { gap: space.lg }]}>
            <Bone width={34} height={14} />
            <Bone width={34} height={14} />
            <Bone width={20} height={14} />
            <Bone width={40} height={10} style={{ marginLeft: 'auto' }} />
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

/** Fila de vibes do topo da Início. */
export function VibesRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Skeleton testID="skeleton-vibes" style={[styles.row, { gap: space.md, paddingVertical: space.sm }]}>
      {repeat(count).map((i) => (
        <View key={i} style={{ alignItems: 'center', gap: 6 }}>
          <Bone circle size={62} />
          <Bone width={44} height={8} />
        </View>
      ))}
    </Skeleton>
  );
}

/** Linhas de música (Músicas, Curtidas, busca): capa, título, artista e o logo. */
export function TrackListSkeleton({ count = 6, cover = 52, rank = false, trailing = true }: { count?: number; cover?: number; rank?: boolean; trailing?: boolean }) {
  return (
    <Skeleton testID="skeleton-tracks" style={{ gap: space.md, paddingVertical: space.sm }}>
      {repeat(count).map((i) => (
        <View key={i} style={styles.row}>
          {rank ? <Bone width={18} height={14} /> : null}
          <Bone width={cover} height={cover} radius={cover > 52 ? 4 : 10} />
          <View style={{ flex: 1, gap: 6 }}>
            <Bone width={i % 2 ? '60%' : '75%'} height={12} />
            <Bone width="40%" height={10} />
          </View>
          {trailing ? <Bone circle size={20} /> : null}
        </View>
      ))}
    </Skeleton>
  );
}

/** Pessoas (seguidores, busca, bloqueados) e notificações: avatar e duas linhas. */
export function PeopleSkeleton({ count = 6, avatar = 44, action = false }: { count?: number; avatar?: number; action?: boolean }) {
  return (
    <Skeleton testID="skeleton-people" style={{ gap: space.md, paddingVertical: space.sm }}>
      {repeat(count).map((i) => (
        <View key={i} style={styles.row}>
          <Bone circle size={avatar} />
          <View style={{ flex: 1, gap: 6 }}>
            <Bone width={i % 2 ? '45%' : '60%'} height={12} />
            <Bone width="30%" height={10} />
          </View>
          {action ? <Bone width={84} height={30} radius={radius.md} /> : null}
        </View>
      ))}
    </Skeleton>
  );
}

/** Comentários de um post. */
export function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Skeleton testID="skeleton-comments" style={{ gap: space.lg, paddingVertical: space.md }}>
      {repeat(count).map((i) => (
        <View key={i} style={[styles.row, { alignItems: 'flex-start' }]}>
          <Bone circle size={32} />
          <View style={{ flex: 1, gap: 6 }}>
            <Bone width="35%" height={10} />
            <Bone width={i % 2 ? '70%' : '90%'} height={11} />
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

/** Perfil (Figma: Profile page): banner, foto no centro, nome, números e bio. */
export function ProfileSkeleton({ topInset = 0 }: { topInset?: number }) {
  return (
    <Skeleton testID="skeleton-profile">
      <Bone height={150 + topInset} radius={0} />
      <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
        <View style={[styles.row, { justifyContent: 'space-between', marginTop: -48 }]}>
          <Bone width={86} height={64} radius={12} style={{ marginTop: 56 }} />
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Bone circle size={104} style={{ borderWidth: 4, borderColor: colors.background }} />
            <Bone width={120} height={14} />
            <Bone width={80} height={10} />
            <Bone width={96} height={30} radius={15} />
          </View>
          <Bone width={86} height={64} radius={12} style={{ marginTop: 56 }} />
        </View>
        <Bone height={56} radius={12} />
      </View>
      <View style={{ paddingHorizontal: space.lg }}>
        <PostSkeleton count={2} />
      </View>
    </Skeleton>
  );
}

/** Pilha do Descobrir: o cartão e os botões embaixo. */
export function DeckSkeleton({ height }: { height: number }) {
  return (
    <Skeleton testID="skeleton-deck" style={{ gap: space.lg }}>
      <View style={{ height, borderRadius: 16, backgroundColor: colors.card, padding: space.lg, gap: space.md }}>
        <Bone height="62%" radius={8} />
        <Bone width="70%" height={16} />
        <Bone width="45%" height={12} />
        <Bone width="55%" height={10} />
      </View>
      <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: space.md }]}>
        <Bone circle size={28} />
        <Bone circle size={52} />
        <Bone circle size={72} />
        <Bone circle size={52} />
        <Bone circle size={28} />
      </View>
    </Skeleton>
  );
}

/**
 * Tela do app enquanto ele abre (fontes e sessão): abas do topo, fila de vibes, posts e a
 * barra de baixo. Na web, vai pronta no HTML, então aparece antes de o JavaScript rodar.
 */
export function AppSkeleton() {
  return (
    <View style={styles.app}>
      <Skeleton testID="skeleton-app" style={{ flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.md, overflow: 'hidden' }}>
        <View style={[styles.row, { justifyContent: 'center', gap: space.xl }]}>
          <Bone width={80} height={14} />
          <Bone circle size={22} style={{ position: 'absolute', right: 0 }} />
        </View>
        <View style={[styles.row, { gap: space.md, paddingVertical: space.sm }]}>
          {repeat(5).map((i) => (
            <Bone key={i} circle size={62} />
          ))}
        </View>
        <PostSkeleton count={3} />
      </Skeleton>
      <View style={styles.tabBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  post: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  app: { flex: 1, backgroundColor: colors.background },
  tabBar: { height: 64, backgroundColor: colors.tabBar, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});
