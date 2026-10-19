import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { carouselOptions, onTabTransition, SwipeTabs } from '../../components/SwipeTabs';
import { TabBar } from '../../components/TabBar';
import { useIsDesktop } from '../../lib/layout';
import { colors } from '../../theme';

/** Abas do app, na ordem do Figma: Início, Buscar, + (postar), Músicas, Perfil. */
export default function TabsLayout() {
  const { t } = useTranslation();
  // Desktop: a barra lateral troca de aba na hora (o carrossel é só do celular).
  const desktop = useIsDesktop();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      // Fechar o "postar" (o X) volta para a aba de onde a pessoa veio.
      backBehavior="history"
      // Carrossel: arrastar para os lados puxa a aba vizinha (Início ↔ Descobrir ↔ Músicas ↔
      // Perfil) e a troca desliza. As abas não são desligadas fora da tela (detachInactiveScreens
      // false): desligar e religar durante a animação fazia telas não carregarem no celular.
      detachInactiveScreens={false}
      screenLayout={({ children, route, navigation }) => (
        <SwipeTabs
          route={route.name}
          focused={navigation.isFocused()}
          onNavigate={(name) => navigation.navigate(name)}
          onPreload={(name) => navigation.preload(name)}
        >
          {children}
        </SwipeTabs>
      )}
      screenListeners={({ route }) => ({ transitionStart: () => onTabTransition(route.name) })}
      screenOptions={({ route }) => ({ headerShown: false, sceneStyle: { backgroundColor: colors.background }, freezeOnBlur: desktop, ...carouselOptions(route.name, !desktop) })}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.feed') }} />
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover') }} />
      <Tabs.Screen name="compose" options={{ title: t('tabs.compose') }} />
      <Tabs.Screen name="music" options={{ title: t('tabs.music') }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
