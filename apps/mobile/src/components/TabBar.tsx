import { Tabs } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../assets/icons';
import { colors } from '../theme';
import { Icon } from './figma';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Ordem e ícone de cada aba (Figma: barra inferior com o "+" no meio). */
const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'tabs.feed' },
  discover: { icon: 'search', label: 'tabs.discover' },
  compose: { icon: 'plus', label: 'tabs.compose' },
  music: { icon: 'music', label: 'tabs.music' },
  me: { icon: 'profile', label: 'tabs.profile' },
};

/** Barra inferior do Figma: fundo #5A5577 com cantos arredondados e o botão "+" roxo saltado. */
export function TabBar({ state, navigation }: TabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          if (!focused) navigation.navigate(route.name, route.params);
          // O "+" virou X: fechar o postar (a tela cuida da animação; isto é só o plano B).
          else if (route.name === 'compose') navigation.goBack();
        };
        const label = t(tab.label);

        if (route.name === 'compose') {
          return (
            <View key={route.key} style={styles.slot}>
              <Pressable
                testID="tab-compose"
                accessibilityRole="button"
                accessibilityLabel={focused ? t('common.close') : label}
                onPress={onPress}
                style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
              >
                <PlusToX open={focused} />
              </Pressable>
            </View>
          );
        }

        return (
          <Pressable
            key={route.key}
            testID={`tab-${route.name}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={styles.slot}
            hitSlop={8}
          >
            <Icon name={tab.icon} size={22} color={focused ? colors.text : colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** O "+" gira 45° e vira um X enquanto a tela de postar está aberta. */
function PlusToX({ open }: { open: boolean }) {
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.set(withSpring(open ? 1 : 0, { damping: 14, stiffness: 180 }));
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 45}deg` }] }));
  return (
    <Animated.View style={style} testID={open ? 'compose-close-icon' : 'compose-open-icon'}>
      <Icon name="plus" size={18} color={colors.text} />
    </Animated.View>
  );
}

const FAB = 62;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tabBar,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    minHeight: 70,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48 },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    marginTop: -38, // sobe sobre a borda da barra, como no Figma
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
