import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { RingAvatar } from '../../components/figma';
import { Button, ErrorText, Screen } from '../../components/ui';
import { fetchBlockedProfiles, unblockUser } from '../../lib/api';
import { formatError } from '../../lib/errors';
import type { PersonCard } from '../../lib/types';
import { colors, fonts, space, text } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { PeopleSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

/** Quem eu bloqueei, com a opção de desbloquear. */
export default function BlockedScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const blocked = useQuery({ queryKey: ['blocked'], queryFn: fetchBlockedProfiles, staleTime: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unblock = async (p: PersonCard) => {
    setBusy(p.id);
    setError(null);
    try {
      await unblockUser(p.id);
      qc.setQueryData<PersonCard[]>(['blocked'], (list) => list?.filter((x) => x.id !== p.id));
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['search-people'] });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: space.lg }}>
      <Stack.Screen options={{ title: t('blocked.title') }} />
      <Text style={text.small}>{t('blocked.hint')}</Text>
      <ErrorText>{error}</ErrorText>
      {blocked.isLoading ? (
        <PeopleSkeleton count={4} action />
      ) : blocked.isError ? (
        <ErrorState message={formatError(t, blocked.error)} onRetry={() => blocked.refetch()} />
      ) : !blocked.data?.length ? (
        <Text testID="blocked-empty" style={[text.body, styles.empty]}>
          {t('blocked.empty')}
        </Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {uniqueBy(blocked.data, (p) => p.id, 'bloqueados').map((p) => (
            <View key={p.id} testID={`blocked-${p.username}`} style={styles.row}>
              <RingAvatar uri={p.avatar_url} name={p.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.display_name}
                </Text>
                <Text style={styles.handle}>@{p.username}</Text>
              </View>
              <Button testID={`unblock-${p.username}`} size="sm" variant="ghost" title={t('blocked.unblock')} onPress={() => unblock(p)} loading={busy === p.id} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
});
