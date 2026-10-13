import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { colors, space, text } from '../theme';
import { Button } from './ui';

/**
 * Carregamento que falhou: o motivo e um botão "Tentar de novo" (antes só dava para puxar a
 * tela, e nem todo mundo sabe disso).
 */
export function ErrorState({ message, onRetry, testID = 'error-state' }: { message: string; onRetry: () => unknown; testID?: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View testID={testID} style={styles.wrap} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
      <Text style={[text.body, styles.message]}>{message}</Text>
      <Button testID={`${testID}-retry`} title={t('common.retry')} size="sm" variant="ghost" onPress={retry} loading={busy} style={{ alignSelf: 'center' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, marginTop: space.xl, paddingHorizontal: space.lg },
  message: { color: colors.textMuted, textAlign: 'center' },
});
