import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '../../theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.semibold },
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.feed'), tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: t('tabs.discover'), tabBarIcon: ({ color, size }) => <Ionicons name="compass" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="compose"
        options={{ title: t('tabs.compose'), tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={colors.primary} size={size + 8} /> }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: t('tabs.profile'), headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
