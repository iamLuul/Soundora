import { cloneElement, useEffect, useState, type ReactElement } from 'react';
import {
  Animated,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { colors } from '../theme';
import { Spinner } from './Spinner';

/** Quanto puxar (px) para valer como "atualizar". */
const TRIGGER = 70;
/** Na web, o dedo anda mais que o indicador (resistência, como no celular). */
const RESISTANCE = 0.5;
const MIN_SPIN_MS = 500;
/**
 * Onde o anel fica. iOS: no espaço que a lista abre no topo ao puxar. Web: a lista não desce,
 * então o anel desce por cima dela (como no Chrome), até um pouco abaixo do topo.
 */
const RESTING_TOP = Platform.OS === 'web' ? 56 : 12;
const SLIDE =
  Platform.OS === 'web'
    ? { inputRange: [0, TRIGGER], outputRange: [-RESTING_TOP - 40, 0], extrapolate: 'clamp' as const }
    : { inputRange: [0, TRIGGER], outputRange: [-24, 0], extrapolate: 'clamp' as const };

// Web: puxar para baixo no topo não deixa o navegador recarregar a página (vale também no
// servidor de desenvolvimento, que não usa o +html.tsx).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.overscrollBehaviorY = 'none';
  document.body?.style.setProperty('overscroll-behavior-y', 'none');
}

type ListProps = Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle' | 'refreshControl' | 'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel'>;

/**
 * Puxar para atualizar com o spinner do Soundora (anel roxo girando num disco escuro), igual
 * no iOS, no Android e na web. Envolve a lista (FlatList/ScrollView):
 *
 *   <PullToRefresh onRefresh={() => q.refetch()}><FlatList … /></PullToRefresh>
 *
 * O spinner aparece só quando a pessoa puxa (até a busca terminar), não a cada atualização
 * automática (foco, notificações ao vivo), que acontecem em silêncio.
 *
 * - iOS: o controle nativo continua fazendo o gesto, mas invisível; o anel acompanha o dedo.
 * - Android: o controle nativo (que não avisa o quanto foi puxado), nas cores do app.
 * - Web: o navegador não recarrega mais a página ao puxar (+html.tsx); o gesto é tratado aqui
 *   e só busca os dados de novo.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => unknown; children: ReactElement<ListProps> }) {
  const [pull] = useState(() => new Animated.Value(0));
  const [refreshing, setRefreshing] = useState(false);
  const [gesture] = useState(() => createWebPull(pull));

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await runAtLeast(onRefresh, MIN_SPIN_MS);
    setRefreshing(false);
  };
  // O gesto da web chama sempre a versão mais nova do refresh.
  useEffect(() => gesture.bind(refresh, refreshing));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    gesture.scrolled(y);
    if (Platform.OS === 'ios') pull.setValue(Math.max(0, -y));
    children.props.onScroll?.(e);
  };

  const list = cloneElement(children, {
    onScroll,
    scrollEventThrottle: children.props.scrollEventThrottle ?? 16,
    ...(Platform.OS === 'web' ? gesture.handlers : {}),
    refreshControl:
      Platform.OS === 'web' ? undefined : (
        <RefreshControl
          testID="pull-to-refresh"
          refreshing={refreshing}
          onRefresh={refresh}
          // iOS: some com as "pétalas" do sistema; quem aparece é o anel abaixo.
          tintColor="transparent"
          // Android: o círculo do sistema, mas lilás num disco escuro (era branco).
          colors={[colors.muted]}
          progressBackgroundColor={colors.card}
        />
      ),
  } satisfies ListProps);

  const showRing = Platform.OS !== 'android';
  return (
    <View style={styles.wrap}>
      {list}
      {showRing && refreshing ? (
        <View pointerEvents="none" style={styles.slot}>
          <View style={styles.disc}>
            <Spinner size={22} />
          </View>
        </View>
      ) : null}
      {showRing && !refreshing ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.slot,
            {
              opacity: pull.interpolate({ inputRange: [6, 36], outputRange: [0, 1], extrapolate: 'clamp' }),
              transform: [{ translateY: pull.interpolate(SLIDE) }],
            },
          ]}
        >
          <Animated.View
            style={[styles.disc, { transform: [{ rotate: pull.interpolate({ inputRange: [0, TRIGGER * 2], outputRange: ['0deg', '540deg'] }) }] }]}
          >
            <Spinner size={22} spinning={false} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Chama `fn` e espera no mínimo `ms` (erros ficam com quem chamou, que já os mostra). */
async function runAtLeast(fn: () => unknown, ms: number) {
  const started = Date.now();
  try {
    await fn();
  } catch {
    // só some o spinner
  }
  const rest = ms - (Date.now() - started);
  if (rest > 0) await new Promise((r) => setTimeout(r, rest));
}

/** Web: o gesto de puxar com o dedo, só quando a lista já está no topo. */
function createWebPull(pull: Animated.Value) {
  let atTop = true;
  let startY: number | null = null;
  let pulled = 0;
  let busy = false;
  let refresh: () => unknown = () => undefined;
  const settle = () => Animated.timing(pull, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  const reset = () => {
    startY = null;
    pulled = 0;
    settle();
  };
  return {
    bind(fn: () => unknown, isBusy: boolean) {
      refresh = fn;
      busy = isBusy;
    },
    scrolled(y: number) {
      atTop = y <= 0;
    },
    handlers: {
      onTouchStart: (e: GestureResponderEvent) => {
        startY = atTop && !busy ? (e.nativeEvent.touches[0]?.pageY ?? null) : null;
        pulled = 0;
      },
      onTouchMove: (e: GestureResponderEvent) => {
        if (startY === null) return;
        const dy = (e.nativeEvent.touches[0]?.pageY ?? startY) - startY;
        pulled = Math.max(0, dy * RESISTANCE);
        pull.setValue(pulled);
      },
      onTouchEnd: () => {
        if (startY === null) return;
        if (pulled >= TRIGGER) void refresh();
        reset();
      },
      onTouchCancel: reset,
    },
  };
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  slot: { position: 'absolute', top: RESTING_TOP, left: 0, right: 0, alignItems: 'center' },
  disc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
