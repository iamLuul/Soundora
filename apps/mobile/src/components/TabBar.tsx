import { router, Tabs } from 'expo-router';
import { useContext, useEffect, type ComponentProps } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BottomTabBarHeightCallbackContext, BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../assets/icons';
import { useIsDesktop } from '../lib/layout';
import { colors, fonts, space } from '../theme';
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
 * Barra de abas em Liquid Glass (Figma: "NavBar / Liquid Glass"): uma cápsula de vidro com
 * Início, Buscar, Músicas e Perfil, e o botão de postar num círculo de vidro roxo ao lado.
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
      <GlassSurface style={styles.capsule} interactive>
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
                style={({ pressed }) => [styles.slot, pressed && { opacity: 0.7 }]}
                hitSlop={4}
              >
                <View style={styles.legible}>
                  <Icon name={tab.icon} size={21} color={color} />
                </View>
                <Text style={[styles.label, focused && styles.labelOn, { color }]} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
      {composeIndex >= 0 ? (
        <Pressable
          testID="tab-compose"
          // Dentro da barra de abas, cada item é uma aba, inclusive o +.
          accessibilityRole="tab"
          accessibilityState={{ selected: composeOpen }}
          accessibilityLabel={composeOpen ? t('common.close') : t(TABS.compose!.label)}
          onPress={() => press(composeIndex)}
          style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <GlassSurface style={styles.fab} tint={FAB_TINT} interactive>
            <PlusToX open={composeOpen} />
          </GlassSurface>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Abas inativas: lilás claro (legível sobre o conteúdo que passa por baixo do vidro). */
const INACTIVE = 'rgba(228, 224, 255, 0.85)';
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
  capsule: { flex: 1, height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  slot: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 3 },
  // Sombra suave no ícone e no texto: continuam legíveis sobre um cartão claro passando por baixo.
  legible: Platform.select<ViewStyle>({ web: { filter: 'drop-shadow(0 1px 2px rgba(20,15,40,0.45))' } as ViewStyle, default: {} })!,
  label: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    textShadowColor: 'rgba(20, 15, 40, 0.45)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  labelOn: { fontFamily: fonts.bold },
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
