import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '../../components/ErrorState';
import { RingAvatar } from '../../components/figma';
import { SettingsScreen } from '../../components/Settings';
import { PeopleSkeleton } from '../../components/Skeleton';
import { fetchFollowRequests } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { relativeTime } from '../../lib/i18n';
import { keys } from '../../lib/queries';
import { colors, fonts, space, text } from '../../theme';
import { RequestActions } from '../notifications';

/** Pedidos para seguir (conta privada): aceitar ou recusar. */
export default function FollowRequestsScreen() {
  const { t } = useTranslation();
  const requests = useQuery({ queryKey: keys.followRequests, queryFn: fetchFollowRequests, staleTime: 0 });

  return (
    <SettingsScreen title={t('requests.title')}>
      {requests.isLoading ? (
        <PeopleSkeleton count={4} avatar={44} />
      ) : requests.isError ? (
        <ErrorState message={formatError(t, requests.error)} onRetry={() => requests.refetch()} />
      ) : !requests.data?.length ? (
        <Text style={[text.body, { color: colors.textMuted, textAlign: 'center' }]}>{t('requests.empty')}</Text>
      ) : (
        <View style={{ gap: space.md }}>
          {requests.data.map((r) => (
            <View key={r.id} testID={`request-${r.username}`} style={styles.row}>
              <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${r.username}`)} style={styles.person}>
                <RingAvatar uri={r.avatar_url} name={r.display_name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.display_name}
                  </Text>
                  <Text style={styles.handle} numberOfLines={1}>
                    @{r.username} · {relativeTime(r.requested_at)}
                  </Text>
                </View>
              </Pressable>
              <RequestActions requesterId={r.id} username={r.username} onDone={() => void requests.refetch()} />
            </View>
          ))}
        </View>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
});
