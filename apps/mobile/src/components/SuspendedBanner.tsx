import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { isSuspended } from '../lib/admin';
import { useAuth } from '../lib/auth';
import { exactTime } from '../lib/i18n';
import { colors, fonts, radius, space } from '../theme';

/** Aviso no topo da Início para quem está com a conta suspensa (o banco já bloqueia as ações). */
export function SuspendedBanner() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const until = profile?.suspended_until;
  if (!isSuspended(until)) return null;
  return (
    <View style={styles.box} accessibilityRole="alert" testID="suspended-banner">
      <Ionicons name="alert-circle" size={18} color={colors.background} />
      <Text style={styles.text}>{until === 'infinity' ? t('admin.suspendedBannerForever') : t('admin.suspendedBanner', { date: exactTime(until!) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', backgroundColor: colors.warning, borderRadius: radius.md, padding: space.md, marginHorizontal: space.lg, marginBottom: space.sm },
  text: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.background },
});
