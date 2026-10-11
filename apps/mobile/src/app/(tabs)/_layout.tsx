import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SwipeTabs } from '../../components/SwipeTabs';
import { TabBar } from '../../components/TabBar';
import { colors } from '../../theme';

/** Abas do app, na ordem do Figma: Início, Buscar, + (postar), Músicas, Perfil. */
export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      // Fechar o "postar" (o X) volta para a aba de onde a pessoa veio.
      backBehavior="history"
      // Arrastar para os lados passa para a aba vizinha (Início ↔ Descobrir ↔ Músicas ↔ Perfil).
      // Sem animação de troca: com ela, no celular a aba nova às vezes ficava sem carregar.
      screenLayout={({ children, route, navigation }) => (
        <SwipeTabs route={route.name} onNavigate={(name) => navigation.navigate(name)}>
          {children}
        </SwipeTabs>
      )}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.feed') }} />
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover') }} />
      <Tabs.Screen name="compose" options={{ title: t('tabs.compose') }} />
      <Tabs.Screen name="music" options={{ title: t('tabs.music') }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
