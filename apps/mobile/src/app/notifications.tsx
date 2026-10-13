import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader, RingAvatar, TopTabs } from '../components/figma';
import { Button } from '../components/ui';
import { markNotificationsRead, respondFollowRequest, type NotificationFilter, type NotificationItem } from '../lib/api';
import { notify } from '../lib/dialogs';
import { showToast } from '../components/Toast';
import { formatError } from '../lib/errors';
import { relativeTime } from '../lib/i18n';
import { enablePush, pushAvailability, pushEnabled } from '../lib/push';
import { keys, useNotifications } from '../lib/queries';
import { colors, fonts, space, text } from '../theme';
import { uniqueBy } from '../lib/hooks';
import { PeopleSkeleton } from '../components/Skeleton';
import { listPerf } from '../lib/list';
import { webTouch } from '../lib/touch';
import { PullToRefresh } from '../components/PullToRefresh';
import { Spinner } from '../components/Spinner';
import { ErrorState } from '../components/ErrorState';

/** Notificações (Figma: Notifications page): Todas e Respostas, com push opcional no celular. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<NotificationFilter>('all');
  const query = useNotifications(tab);
  const items = uniqueBy(query.data?.pages.flat() ?? [], (n) => String(n.id), 'notificações');

  // Ao abrir a tela, tudo vira lido (a bolinha do sino some). As linhas continuam destacadas
  // até a próxima atualização, para a pessoa ver o que era novo.
  useFocusEffect(
    useCallback(() => {
      markNotificationsRead()
        .then(() => qc.setQueryData(keys.unread, 0))
        .catch(() => undefined);
    }, [qc]),
  );

  const open = (item: NotificationItem) => {
    if (item.post_id) router.push(`/post/${item.post_id}`);
    else if (item.review_album_id) router.push(`/album/${item.review_album_id}`);
    else router.push(`/u/${item.actor_username}`);
  };

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
      <PullToRefresh onRefresh={() => query.refetch()}>
        <FlatList
          {...listPerf}
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <NotificationRow item={item} onPress={() => open(item)} />}
          ListHeaderComponent={<PushCard />}
          ListEmptyComponent={
            query.isLoading ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <PeopleSkeleton count={8} avatar={40} />
              </View>
            ) : query.isError ? (
              <ErrorState message={formatError(t, query.error)} onRetry={() => query.refetch()} />
            ) : (
              <Text style={[text.body, styles.empty]}>{t(tab === 'replies' ? 'notifications.emptyReplies' : 'notifications.empty')}</Text>
            )
          }
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={query.isFetchingNextPage ? <Spinner style={{ margin: space.lg }} /> : null}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        />
      </PullToRefresh>
    </View>
  );
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const { t } = useTranslation();
  const action = t(`notifications.${item.kind}`);
  const label = `@${item.actor_username} ${action}${item.comment_body ? `: ${item.comment_body}` : ''}`;
  // Foto (abre o perfil) e o resto (abre a notificação) lado a lado: um link dentro de um
  // botão não funciona com teclado/leitor de tela (e na web vira <button> dentro de <button>).
  const request = item.kind === 'follow_request';
  return (
    <View style={[styles.item, !item.read && styles.unread]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`@${item.actor_username}`}
          onPress={() => router.push(`/u/${item.actor_username}`)}
          hitSlop={6}
          style={webTouch(6)}
        >
          <RingAvatar uri={item.actor_avatar_url} name={item.actor_display_name} size={44} />
        </Pressable>
        <Pressable
          testID={`notification-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.rowText}>
            <Text style={styles.line} numberOfLines={3}>
              <Text style={styles.bold}>@{item.actor_username}</Text> {action}
              {item.comment_body ? <Text style={styles.quote}>{`: ${item.comment_body}`}</Text> : null}
            </Text>
            <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
          </View>
          {item.preview_image_url ? (
            <Image source={{ uri: item.preview_image_url }} style={styles.cover} accessibilityLabel={item.preview_title ?? undefined} />
          ) : null}
          {!item.read ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>
      {/* Pedido para seguir: aceitar/recusar embaixo do texto (ao lado, espremia o nome). */}
      {request ? (
        <View style={styles.requestRow}>
          <RequestActions requesterId={item.actor_id} username={item.actor_username} />
        </View>
      ) : null}
    </View>
  );
}

/** Pedido para seguir (conta privada): aceitar ou recusar ali mesmo. */
export function RequestActions({ requesterId, username, onDone }: { requesterId: string; username: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    try {
      await respondFollowRequest(requesterId, accept);
      showToast(t(accept ? 'toast.requestAccepted' : 'toast.requestDeclined', { username }));
      onDone?.();
      for (const queryKey of [['notifications'], keys.followRequests, ['profile'], ['people']]) void qc.invalidateQueries({ queryKey });
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.requestActions}>
      <Button
        testID={`accept-${username}`}
        size="sm"
        title={t('requests.accept')}
        onPress={() => respond(true)}
        loading={busy === 'accept'}
        disabled={!!busy}
        style={{ alignSelf: 'auto' }}
      />
      <Button
        testID={`decline-${username}`}
        size="sm"
        variant="ghost"
        title={t('requests.decline')}
        onPress={() => respond(false)}
        loading={busy === 'decline'}
        disabled={!!busy}
        style={{ alignSelf: 'auto' }}
      />
    </View>
  );
}

/** Convite para ativar o push (só no celular, quando ainda não está ativo). */
function PushCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'on' | 'denied'>(() => (pushEnabled() ? 'on' : 'idle'));
  const [error, setError] = useState<string | null>(null);
  if (!pushAvailability().ok || state === 'on') return null;

  const enable = async () => {
    setState('busy');
    setError(null);
    try {
      setState((await enablePush()) ? 'on' : 'denied');
    } catch (err) {
      setError(formatError(t, err));
      setState('idle');
    }
  };

  return (
    <View style={styles.pushCard}>
      <Text style={styles.pushTitle}>{t('notifications.pushTitle')}</Text>
      <Text style={styles.pushBody}>{state === 'denied' ? t('notifications.pushDenied') : t('notifications.pushBody')}</Text>
      {error ? <Text style={[text.small, { color: colors.danger }]}>{error}</Text> : null}
      {state !== 'denied' ? <Button testID="enable-push" title={t('notifications.pushEnable')} size="sm" onPress={enable} loading={state === 'busy'} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.lg },
  header: { justifyContent: 'center' },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  empty: { textAlign: 'center', marginTop: space.lg },
  item: { paddingVertical: space.md, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.tabBar, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  requestRow: { paddingLeft: 44 + space.md },
  unread: { backgroundColor: 'rgba(108, 98, 255, 0.10)', borderRadius: 10 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, gap: 2 },
  line: { fontFamily: fonts.regular, fontSize: 13, color: colors.text, lineHeight: 18 },
  bold: { fontFamily: fonts.bold },
  quote: { color: colors.textMuted },
  time: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  cover: { width: 44, height: 44, borderRadius: 5, backgroundColor: colors.card },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  requestActions: { flexDirection: 'row', gap: space.xs },
  pushCard: { backgroundColor: colors.card, borderRadius: 10, padding: space.lg, gap: space.sm, marginVertical: space.md },
  pushTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  pushBody: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
