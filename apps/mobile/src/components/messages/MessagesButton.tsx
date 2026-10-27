import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDmUnread } from '../../lib/queries';
import { webTouch } from '../../lib/touch';
import { colors, fonts } from '../../theme';

/** Total da bolinha: conversas com mensagem nova + pedidos novos. */
export function useDmBadge(enabled = true): number {
  const { data } = useDmUnread(enabled);
  return (data?.unread ?? 0) + (data?.requests ?? 0);
}

/** Ícone de mensagens do topo do Início (no canto oposto ao sino), com a bolinha de não lidas. */
export function MessagesButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { data, refetch } = useDmUnread();
  const count = (data?.unread ?? 0) + (data?.requests ?? 0);
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  return (
    <Pressable
      testID="open-messages"
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? t('messages.titleUnread', { count }) : t('messages.title')}
      onPress={() => router.push('/messages')}
      hitSlop={12}
      style={[style, webTouch(12)]}
    >
      <Ionicons name="paper-plane-outline" size={21} color={colors.text} />
      {count > 0 ? (
        <View testID="dm-badge" style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.badge,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.text },
});
