import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader, TopTabs } from '../components/figma';
import { colors, fonts, space, text } from '../theme';

type Tab = 'all' | 'replies';

/** Notificações (Figma: Notifications page). Ainda sem notificações: mostra o estado vazio. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header">
          {t('notifications.title')}
        </Text>
      </View>
      <TopTabs
        showBell={false}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: t('notifications.all') },
          { value: 'replies', label: t('notifications.replies') },
        ]}
      />
      <Text style={[text.body, styles.empty]}>{t('notifications.empty')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.lg },
  header: { justifyContent: 'center' },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  empty: { textAlign: 'center', marginTop: space.lg },
});
