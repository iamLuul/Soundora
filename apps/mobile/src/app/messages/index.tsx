import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../components/ErrorState';
import { BackHeader, RingAvatar, TopTabs } from '../../components/figma';
import { PullToRefresh } from '../../components/PullToRefresh';
import { PeopleSkeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import type { DmThread } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { uniqueBy } from '../../lib/hooks';
import { relativeTime } from '../../lib/i18n';
import { listPerf } from '../../lib/list';
import { useDmInbox, useDmUnread } from '../../lib/queries';
import { webTouch } from '../../lib/touch';
import { colors, fonts, glass, space, text } from '../../theme';

type Tab = 'chats' | 'requests';

/**
 * Mensagens: as conversas (da mais recente para a mais antiga) e os Pedidos (de quem você não
 * segue). Abre pelo ícone do topo do Início ou arrastando o Início para o lado.
 */
export default function MessagesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('chats');
  const requests = tab === 'requests';
  const inbox = useDmInbox(requests);
  const unread = useDmUnread();
  const items = uniqueBy(inbox.data?.pages.flat() ?? [], (c) => c.conversation_id, 'conversas');
  const pending = unread.data?.requests ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader
          right={
            <Pressable
              testID="new-message"
              accessibilityRole="button"
              accessibilityLabel={t('messages.new')}
              onPress={() => router.push('/messages/compose')}
              hitSlop={10}
              style={webTouch(10)}
            >
              <Ionicons name="create-outline" size={24} color={colors.text} />
            </Pressable>
          }
        />
        <Text style={styles.title} accessibilityRole="header">
          {t('messages.title')}
        </Text>
      </View>
      <TopTabs
        showBell={false}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'chats', label: t('messages.chats') },
          { value: 'requests', label: pending > 0 ? t('messages.requestsCount', { count: pending }) : t('messages.requests') },
        ]}
      />
      <PullToRefresh onRefresh={() => inbox.refetch()}>
        <FlatList
          {...listPerf}
          data={items}
          keyExtractor={(c) => c.conversation_id}
          renderItem={({ item }) => <ThreadRow item={item} />}
          ListHeaderComponent={requests && items.length ? <Text style={styles.note}>{t('messages.requestsNote')}</Text> : undefined}
          ListEmptyComponent={
            inbox.isLoading ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <PeopleSkeleton count={8} avatar={52} />
              </View>
            ) : inbox.isError ? (
              <ErrorState message={formatError(t, inbox.error)} onRetry={() => inbox.refetch()} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name={requests ? 'mail-unread-outline' : 'paper-plane-outline'} size={40} color={colors.textMuted} />
                <Text style={[text.body, styles.emptyText]}>{t(requests ? 'messages.emptyRequests' : 'messages.empty')}</Text>
              </View>
            )
          }
          onEndReached={() => inbox.hasNextPage && !inbox.isFetchingNextPage && inbox.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={inbox.isFetchingNextPage ? <Spinner style={{ margin: space.lg }} /> : undefined}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
        />
      </PullToRefresh>
    </View>
  );
}

/** "Você: oi", "Respondeu à sua vibe: amei", "Mensagem desfeita"... */
export function threadPreview(
  t: (k: string, v?: Record<string, unknown>) => string,
  c: Pick<DmThread, 'last_body' | 'last_from_me' | 'last_vibe_reply' | 'last_unsent'>,
) {
  const body = c.last_unsent ? t('messages.unsent') : (c.last_body ?? '');
  if (c.last_vibe_reply && !c.last_unsent) return c.last_from_me ? t('messages.youRepliedVibe', { body }) : t('messages.repliedYourVibe', { body });
  return c.last_from_me ? t('messages.you', { body }) : body;
}

function ThreadRow({ item }: { item: DmThread }) {
  const { t } = useTranslation();
  const preview = threadPreview(t, item);
  return (
    <Pressable
      testID={`thread-${item.username}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.display_name}, ${preview}${item.unread ? `, ${t('messages.unread')}` : ''}`}
      onPress={() => router.push(`/messages/${item.conversation_id}`)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        hovered && { backgroundColor: glass.hover },
        pressed && { backgroundColor: glass.pressed },
      ]}
    >
      <RingAvatar uri={item.avatar_url} name={item.display_name} size={52} ring={false} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.name, item.unread && styles.bold]} numberOfLines={1}>
          {item.display_name}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <Text style={[styles.preview, item.unread && styles.previewUnread, item.last_unsent && styles.italic]} numberOfLines={1}>
            {preview}
          </Text>
          <Text style={styles.time}>· {relativeTime(item.last_at)}</Text>
        </View>
      </View>
      {item.unread ? <View testID={`thread-unread-${item.username}`} style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.lg, gap: space.md, marginBottom: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  note: { ...text.small, paddingHorizontal: space.lg, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  bold: { fontFamily: fonts.bold },
  preview: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  previewUnread: { color: colors.text, fontFamily: fonts.semibold },
  italic: { fontStyle: 'italic' },
  time: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  empty: { alignItems: 'center', gap: space.md, marginTop: space.xxl, paddingHorizontal: space.xl },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
});
