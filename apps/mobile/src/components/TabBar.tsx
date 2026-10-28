import { router, Tabs } from 'expo-router';
import { useContext, useEffect, useRef, useState, type ComponentProps } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BottomTabBarHeightCallbackContext, BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../assets/icons';
import { useIsDesktop } from '../lib/layout';
import { colors, space } from '../theme';
import { AccountSwitcher } from './AccountSwitcher';
import { GlassSurface, nativeGlass } from './GlassSurface';
import { Icon } from './figma';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Ordem e ícone de cada aba (Figma: barra inferior com o "+" no meio). */
const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'desktop.home' },
  discover: { icon: 'search', label: 'tabs.discover' },
  compose: { icon: 'plus', label: 'tabs.compose' },
  music: { icon: 'music', label: 'tabs.music' },
  me: { icon: 'profile', label: 'tabs.profile' },
};

/** Altura da cápsula de abas e do botão de postar (Figma: "NavBar / Liquid Glass"). */
export const TAB_BAR_HEIGHT = 64;
/** Distância da cápsula até o fim da tela (além da área segura). */
const BAR_GAP = 10;

/** Quanto do fim da tela a barra flutuante cobre (para as listas não esconderem o último item). */
export function tabBarSpace(bottomInset: number) {
  return TAB_BAR_HEIGHT + Math.max(bottomInset, BAR_GAP) + BAR_GAP;
}

/**
 * Espaço a deixar no fim das listas dentro das abas: a barra flutua por cima do conteúdo
 * (o vidro mostra o que passa por baixo), então o fim da lista precisa de folga. Fora das abas, 0.
 */
export function useTabBarInset(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}

/**
 * Barra de abas em Liquid Glass (Figma: "NavBar / Liquid Glass"): uma cápsula de vidro só com
 * os ícones de Início, Descobrir, Músicas e Perfil, e o botão de postar num círculo de vidro roxo ao lado.
 * Flutua por cima do conteúdo. No iOS 26, o vidro é o nativo da Apple; no resto, um vidro
 * parecido (veja GlassSurface).
 */
export function TabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Desktop: a barra lateral faz o papel das abas.
  const desktop = useIsDesktop();
  // As telas das abas sabem quanto a barra cobre (useTabBarInset).
  const setHeight = useContext(BottomTabBarHeightCallbackContext);
  const space = desktop ? 0 : tabBarSpace(insets.bottom);
  useEffect(() => {
    setHeight?.(space);
  }, [setHeight, space]);
  const [switcher, setSwitcher] = useState(false);
  if (desktop) return null;

  const press = (index: number) => {
    const route = state.routes[index]!;
    const focused = state.index === index;
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    if (!focused) navigateToTab(route.key);
    // O "+" virou X: fechar o postar (a tela cuida da animação; isto é só o plano B).
    else if (route.name === 'compose' && router.canGoBack()) router.back();
  };
  const composeIndex = state.routes.findIndex((r) => r.name === 'compose');
  const composeOpen = state.index === composeIndex;

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, BAR_GAP) }]} pointerEvents="box-none">
      <AccountSwitcher visible={switcher} onClose={() => setSwitcher(false)} />
      <Jelly style={styles.capsule}>
        <GlassSurface style={styles.fill} interactive>
          <View style={styles.row} accessibilityRole="tablist">
            {state.routes.map((route, index) => {
              const tab = TABS[route.name];
              if (!tab || route.name === 'compose') return null;
              const focused = state.index === index;
              const label = t(tab.label);
              const color = focused ? colors.text : INACTIVE;
              return (
                <Pressable
                  key={route.key}
                  testID={`tab-${route.name}`}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: focused }}
                  onPress={() => press(index)}
                  // Segurar o Perfil: trocar de conta (como no Instagram).
                  onLongPress={route.name === 'me' ? () => setSwitcher(true) : undefined}
                  accessibilityHint={route.name === 'me' ? t('accounts.longPressHint') : undefined}
                  style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
                  hitSlop={4}
                >
                  <View style={styles.legible}>
                    <Icon name={tab.icon} size={23} color={color} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
      </Jelly>
      {composeIndex >= 0 ? (
        <Pressable
          testID="tab-compose"
          // Dentro da barra de abas, cada item é uma aba, inclusive o +.
          accessibilityRole="tab"
          accessibilityState={{ selected: composeOpen }}
          accessibilityLabel={composeOpen ? t('common.close') : t(TABS.compose!.label)}
          onPress={() => press(composeIndex)}
        >
          <Jelly>
            <GlassSurface style={styles.fab} tint={FAB_TINT} interactive>
              <PlusToX open={composeOpen} />
            </GlassSurface>
          </Jelly>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Abas inativas: lilás claro, mais apagado que a ativa (branca), legível sobre o conteúdo. */
const INACTIVE = 'rgba(228, 224, 255, 0.62)';

/** Mola do vidro: volta rápido, com um pouco de balanço (como o Liquid Glass do iPhone). */
const SPRING = { damping: 13, stiffness: 240, mass: 0.6 };
/** Quanto o vidro cresce ao tocar/segurar e quanto (no máximo) ele acompanha o dedo. */
const PRESS_SCALE = 0.04;
const MAX_SHIFT_X = 9;
const MAX_SHIFT_Y = 5;

/** Acompanha o dedo, mas cada vez menos (nunca passa de `max`): um elástico. */
export function rubberBand(distance: number, max: number): number {
  'worklet';
  return Math.sign(distance) * max * (1 - Math.exp(-Math.abs(distance) / (max * 5)));
}

/**
 * O "toque de vidro": ao tocar ou segurar, a peça cresce um pouco; arrastando, ela vai um
 * pouquinho junto com o dedo e estica para o lado; ao soltar, volta com uma mola. Os toques
 * nos botões de dentro continuam funcionando (só observa o dedo, não toma o toque).
 * Com "reduzir movimento" ligado, fica parada.
 */
function Jelly({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const press = useSharedValue(0);
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const begin = (x: number, y: number) => {
    if (reduce) return;
    origin.current = { x, y };
    press.set(withSpring(1, SPRING));
  };
  const move = (x: number, y: number) => {
    if (!origin.current) return;
    dx.set(rubberBand(x - origin.current.x, MAX_SHIFT_X));
    dy.set(rubberBand(y - origin.current.y, MAX_SHIFT_Y));
  };
  const end = () => {
    origin.current = null;
    press.set(withSpring(0, SPRING));
    dx.set(withSpring(0, SPRING));
    dy.set(withSpring(0, SPRING));
  };
  const animated = useAnimatedStyle(() => {
    const stretch = Math.abs(dx.get()) / 260;
    return {
      transform: [
        { translateX: dx.get() },
        { translateY: dy.get() },
        { scaleX: 1 + PRESS_SCALE * press.get() + stretch },
        { scaleY: 1 + PRESS_SCALE * press.get() - stretch / 2 },
      ],
    };
  });

  const point = (e: { nativeEvent: object }) => {
    const n = e.nativeEvent as { pageX?: number; pageY?: number; clientX?: number; clientY?: number };
    return [n.pageX ?? n.clientX ?? 0, n.pageY ?? n.clientY ?? 0] as const;
  };
  // Celular: eventos de toque (chegam aqui mesmo com o botão de dentro cuidando do toque).
  // Web: eventos de ponteiro (mouse e toque).
  const handlers: ViewProps =
    Platform.OS === 'web'
      ? {
          onPointerDown: (e: { nativeEvent: object }) => begin(...point(e)),
          onPointerMove: (e: { nativeEvent: object }) => move(...point(e)),
          onPointerUp: end,
          onPointerCancel: end,
          onPointerLeave: end,
        }
      : {
          onTouchStart: (e: { nativeEvent: object }) => begin(...point(e)),
          onTouchMove: (e: { nativeEvent: object }) => move(...point(e)),
          onTouchEnd: end,
          onTouchCancel: end,
        };

  return (
    <Animated.View style={[style, animated]} {...handlers}>
      {children}
    </Animated.View>
  );
}
/** Tinta do botão de postar: o roxo da marca. No vidro nativo o sistema mistura; nos outros, mais opaco. */
const FAB_TINT = nativeGlass ? 'rgba(104, 94, 255, 0.55)' : Platform.OS === 'web' ? 'rgba(104, 94, 255, 0.62)' : 'rgba(104, 94, 255, 0.94)';

/** Abrir: uma volta completa e mais 45° (o "+" para no X). Fechar: o caminho de volta. */
export const PLUS_TURN_DEG = 360 + 45;
const PLUS_TURN_MS = 380;

/** O "+" dá uma volta rápida e vira um X enquanto a tela de postar está aberta. */
function PlusToX({ open }: { open: boolean }) {
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.set(withTiming(open ? 1 : 0, { duration: PLUS_TURN_MS, easing: Easing.out(Easing.cubic) }));
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * PLUS_TURN_DEG}deg` }] }));
  return (
    <Animated.View style={style} testID={open ? 'compose-close-icon' : 'compose-open-icon'}>
      <Icon name="plus" size={18} color={colors.text} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  capsule: { flex: 1, height: TAB_BAR_HEIGHT },
  fill: { flex: 1, borderRadius: TAB_BAR_HEIGHT / 2 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  slot: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  // Sombra suave no ícone: continuam legíveis sobre um cartão claro passando por baixo.
  legible: Platform.select<ViewStyle>({ web: { filter: 'drop-shadow(0 1px 2px rgba(20,15,40,0.45))' } as ViewStyle, default: {} })!,
  fab: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: nativeGlass ? 0 : 1,
    borderColor: 'rgba(104, 94, 255, 0.5)',
  },
});
