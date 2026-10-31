import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { RingAvatar } from '../../components/figma';
import { Button, ErrorText, Screen } from '../../components/ui';
import { fetchMutedProfiles, setUserMuted } from '../../lib/api';
import { formatError } from '../../lib/errors';
import type { PersonCard } from '../../lib/types';
import { colors, fonts, space, text } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { PeopleSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

/** Quem eu silenciei, com a opção de deixar de silenciar. */
export default function MutedAccountsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const muted = useQuery({ queryKey: ['muted-accounts'], queryFn: fetchMutedProfiles, staleTime: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unmute = async (p: PersonCard) => {
    setBusy(p.id);
    setError(null);
    try {
      await setUserMuted(p.id, false);
      qc.setQueryData<PersonCard[]>(['muted-accounts'], (list) => list?.filter((x) => x.id !== p.id));
      qc.setQueryData(['muted', p.id], false);
      for (const queryKey of [['feed'], ['feed-following'], ['vibes', 'tray'], ['reviews'], ['reviews-for-you']]) void qc.invalidateQueries({ queryKey });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: space.lg }}>
      <Stack.Screen options={{ title: t('muted.title') }} />
      <Text style={text.small}>{t('muted.hint')}</Text>
      <ErrorText>{error}</ErrorText>
      {muted.isLoading ? (
        <PeopleSkeleton count={4} action />
      ) : muted.isError ? (
        <ErrorState message={formatError(t, muted.error)} onRetry={() => muted.refetch()} />
      ) : !muted.data?.length ? (
        <Text testID="muted-empty" style={[text.body, styles.empty]}>
          {t('muted.empty')}
        </Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {uniqueBy(muted.data, (p) => p.id, 'silenciados').map((p) => (
            <View key={p.id} testID={`muted-${p.username}`} style={styles.row}>
              <RingAvatar uri={p.avatar_url} name={p.display_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.display_name}
                </Text>
                <Text style={styles.handle}>@{p.username}</Text>
              </View>
              <Button
                testID={`unmute-${p.username}`}
                size="sm"
                variant="ghost"
                title={t('mutedAccounts.unmute')}
                onPress={() => unmute(p)}
                loading={busy === p.id}
              />
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
