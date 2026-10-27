import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorScreen } from '../../components/ErrorScreen';
import { ErrorState } from '../../components/ErrorState';
import { RingAvatar } from '../../components/figma';
import { OptionsSheet, type SheetOption } from '../../components/OptionsSheet';
import { Spinner } from '../../components/Spinner';
import { showToast } from '../../components/Toast';
import { keyboardBehavior } from '../../components/ui';
import { Verified } from '../../components/Verified';
import { VibeBackground } from '../../components/vibes/VibeBackground';
import { acceptDm, deleteDm, DM_MAX, likeDm, markDmRead, sendDm, unsendDm, type DmMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { confirmAction, notify } from '../../lib/dialogs';
import { errorStatus, formatError } from '../../lib/errors';
import { uniqueBy } from '../../lib/hooks';
import { keys, useDmConversation, useDmMessages, useVibeMedia } from '../../lib/queries';
import { webTouch } from '../../lib/touch';
import { colors, fonts, space, text } from '../../theme';

type Params = { id: string; to?: string; username?: string; name?: string; avatar?: string };

/** Mais que isso entre duas mensagens: aparece a hora no meio da conversa. */
const GAP_MS = 20 * 60_000;

/**
 * Uma conversa: as mensagens (a mais nova embaixo), "Visto" na última que você mandou, a vibe
 * respondida em miniatura e a caixa de escrever. Pedido (de quem você não segue): aceitar ou
 * apagar antes de responder. `id = draft`: conversa nova, criada na primeira mensagem.
 */
export default function ConversationScreen() {
  const params = useLocalSearchParams<Params>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const draft = params.id === 'draft';
  const id = draft ? null : params.id;
  const conv = useDmConversation(id);
  const messages = useDmMessages(id);
  const list = useMemo(() => uniqueBy(messages.data?.pages.flat() ?? [], (m) => String(m.id), 'mensagens'), [messages.data]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [menuFor, setMenuFor] = useState<DmMessage | null>(null);

  const other = conv.data
    ? { id: conv.data.user_id, username: conv.data.username, name: conv.data.display_name, avatar: conv.data.avatar_url }
    : draft && params.to
      ? { id: params.to, username: params.username ?? '', name: params.name ?? params.username ?? '', avatar: params.avatar || null }
      : null;
  const isRequest = conv.data ? !conv.data.accepted : false;

  // Marca como lida ao abrir e quando chega mensagem nova dela (só se não for pedido: quem
  // mandou não fica sabendo que eu li um pedido).
  const newest = list[0];
  const lastMarked = useRef<number | null>(null);
  useEffect(() => {
    if (!id || !newest || newest.from_me || isRequest || lastMarked.current === newest.id) return;
    lastMarked.current = newest.id;
    markDmRead(id)
      .then(() => qc.invalidateQueries({ queryKey: keys.dmUnread }))
      .catch(() => undefined);
  }, [id, newest, isRequest, qc]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['dm'] });

  const send = async () => {
    const text = body.trim();
    if (!text || sending || !other) return;
    setSending(true);
    setBody('');
    try {
      const sent = await sendDm(text, id ? { conversation: id } : { to: other.id });
      if (!id) router.replace(`/messages/${sent.conversation_id}`);
      await refresh();
    } catch (err) {
      setBody(text);
      notify(formatError(t, err));
    } finally {
      setSending(false);
    }
  };

  const accept = async () => {
    if (!id) return;
    try {
      await acceptDm(id);
      await refresh();
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  const remove = async () => {
    if (!id) return;
    if (!(await confirmAction(t('messages.deleteConfirm'), t('confirm.delete'), t('common.cancel')))) return;
    try {
      await deleteDm(id);
      await refresh();
      if (router.canGoBack()) router.back();
      else router.replace('/messages');
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  const menu: SheetOption[] = !menuFor
    ? []
    : [
        ...(!menuFor.from_me && !menuFor.unsent
          ? [
              {
                key: 'like',
                label: menuFor.liked ? t('messages.unlike') : t('messages.like'),
                icon: (menuFor.liked ? 'heart-dislike-outline' : 'heart-outline') as SheetOption['icon'],
                onPress: async () => {
                  const m = menuFor;
                  setMenuFor(null);
                  try {
                    await likeDm(m.id, !m.liked);
                    await refresh();
                  } catch (err) {
                    notify(formatError(t, err));
                  }
                },
              },
            ]
          : []),
        ...(menuFor.body
          ? [
              {
                key: 'copy',
                label: t('messages.copy'),
                icon: 'copy-outline' as const,
                onPress: async () => {
                  const value = menuFor.body ?? '';
                  setMenuFor(null);
                  await Clipboard.setStringAsync(value);
                  showToast(t('messages.copied'));
                },
              },
            ]
          : []),
        ...(menuFor.from_me && !menuFor.unsent
          ? [
              {
                key: 'unsend',
                label: t('messages.unsendAction'),
                icon: 'arrow-undo-outline' as const,
                danger: true,
                onPress: async () => {
                  const m = menuFor;
                  setMenuFor(null);
                  try {
                    await unsendDm(m.id);
                    await refresh();
                  } catch (err) {
                    notify(formatError(t, err));
                  }
                },
              },
            ]
          : []),
      ];

  // "Visto" na última mensagem minha que a outra pessoa já leu.
  const seenAt = conv.data?.their_last_read_at ?? null;
  const lastMine = list.find((m) => m.from_me);
  const seenId = lastMine && seenAt && lastMine.created_at <= seenAt && list[0]?.id === lastMine.id ? lastMine.id : null;

  if (id && conv.isSuccess && !conv.data) return <NotFound />;
  if (id && conv.isError) {
    const status = errorStatus(conv.error);
    if (status === 401 || status === 403 || status === 404) return <ErrorScreen code={status} />;
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={keyboardBehavior}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          testID="back"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
          hitSlop={10}
          style={webTouch(10)}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        {other ? (
          <Pressable
            testID="conversation-profile"
            accessibilityRole="link"
            accessibilityLabel={`${other.name}, @${other.username}`}
            onPress={() => router.push(`/u/${other.username}`)}
            style={styles.who}
          >
            <RingAvatar uri={other.avatar} name={other.name} size={36} ring={false} />
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {other.name}
                </Text>
                <Verified username={other.username} size={12} />
              </View>
              <Text style={styles.handle}>@{other.username}</Text>
            </View>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {id ? (
          <Pressable
            testID="conversation-delete"
            accessibilityRole="button"
            accessibilityLabel={t('messages.delete')}
            onPress={remove}
            hitSlop={10}
            style={webTouch(10)}
          >
            <Ionicons name="trash-outline" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {messages.isLoading || (id && conv.isLoading) ? (
        <Spinner style={{ flex: 1 }} />
      ) : messages.isError ? (
        <View style={{ flex: 1 }}>
          <ErrorState message={formatError(t, messages.error)} onRetry={() => messages.refetch()} />
        </View>
      ) : list.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {other ? (
            <View style={styles.intro} testID="conversation-intro">
              <RingAvatar uri={other.avatar} name={other.name} size={72} ring={false} />
              <Text style={styles.introName}>{other.name}</Text>
              <Text style={styles.handle}>@{other.username}</Text>
              <Text style={[text.small, { textAlign: 'center' }]}>{t('messages.startHint')}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <FlatList
          testID="conversation-list"
          inverted
          data={list}
          keyExtractor={(m) => String(m.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && messages.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={messages.isFetchingNextPage ? <Spinner style={{ margin: space.md }} /> : undefined}
          renderItem={({ item, index }) => {
            const older = list[index + 1];
            const showTime = !older || new Date(item.created_at).getTime() - new Date(older.created_at).getTime() > GAP_MS;
            return (
              <View>
                {showTime ? <Text style={styles.stamp}>{stamp(item.created_at)}</Text> : null}
                <Bubble
                  item={item}
                  otherId={other?.id ?? ''}
                  myId={profile?.id ?? ''}
                  otherUsername={other?.username ?? ''}
                  onLongPress={() => setMenuFor(item)}
                />
                {item.id === seenId ? (
                  <Text testID="message-seen" style={styles.seen}>
                    {t('messages.seen')}
                  </Text>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {isRequest ? (
        <View style={[styles.request, { paddingBottom: insets.bottom + space.md }]} testID="request-bar">
          <Text style={[text.small, { textAlign: 'center' }]}>{t('messages.requestInfo', { username: other?.username ?? '' })}</Text>
          <View style={styles.requestActions}>
            <Pressable testID="request-delete" accessibilityRole="button" onPress={remove} style={[styles.requestButton, styles.requestGhost]}>
              <Text style={styles.requestText}>{t('messages.decline')}</Text>
            </Pressable>
            <Pressable testID="request-accept" accessibilityRole="button" onPress={accept} style={styles.requestButton}>
              <Text style={styles.requestText}>{t('messages.accept')}</Text>
            </Pressable>
          </View>
        </View>
      ) : conv.data && !conv.data.can_send ? (
        <Text style={[text.small, styles.cannot, { paddingBottom: insets.bottom + space.md }]}>{t('messages.cannotSend')}</Text>
      ) : other ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + space.sm }]}>
          <TextInput
            testID="message-input"
            value={body}
            onChangeText={setBody}
            placeholder={t('messages.placeholder')}
            placeholderTextColor={colors.placeholder}
            accessibilityLabel={t('messages.placeholder')}
            multiline
            maxLength={DM_MAX}
            style={styles.input}
          />
          <Pressable
            testID="message-send"
            accessibilityRole="button"
            accessibilityLabel={t('messages.send')}
            accessibilityState={{ disabled: !body.trim() || sending, busy: sending }}
            disabled={!body.trim() || sending}
            onPress={send}
            style={[styles.send, (!body.trim() || sending) && { opacity: 0.4 }]}
          >
            {sending ? <Spinner size={18} color={colors.text} /> : <Ionicons name="arrow-up" size={20} color={colors.text} />}
          </Pressable>
        </View>
      ) : null}

      <OptionsSheet visible={!!menuFor} options={menu} onClose={() => setMenuFor(null)} />
    </KeyboardAvoidingView>
  );
}

function NotFound() {
  return <ErrorScreen code={404} />;
}

/** Hora no meio da conversa: "14:05" hoje, "12/10 14:05" em outro dia. */
function stamp(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} ${time}`;
}

function Bubble({
  item,
  otherId,
  myId,
  otherUsername,
  onLongPress,
}: {
  item: DmMessage;
  otherId: string;
  myId: string;
  otherUsername: string;
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const mine = item.from_me;
  return (
    <View style={[styles.line, mine ? styles.lineMine : styles.lineTheirs]}>
      {item.vibe_reply && !item.unsent ? (
        <View style={[styles.vibeReply, mine && { alignItems: 'flex-end' }]}>
          <Text style={styles.vibeLabel}>{mine ? t('messages.youRepliedVibeLabel', { username: otherUsername }) : t('messages.repliedYourVibeLabel')}</Text>
          {item.vibe_id ? (
            <Pressable
              testID={`vibe-reply-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('messages.openVibe')}
              // A vibe é de quem recebeu a mensagem: minha, se a outra pessoa respondeu.
              onPress={() => router.push({ pathname: '/vibes/[author]', params: { author: item.vibe_mine ? myId : otherId } })}
            >
              <VibeThumb item={item} />
            </Pressable>
          ) : (
            <View style={[styles.thumb, styles.thumbGone]}>
              <Ionicons name="time-outline" size={18} color={colors.textMuted} />
              <Text style={styles.thumbGoneText}>{t('messages.vibeGone')}</Text>
            </View>
          )}
        </View>
      ) : null}
      <Pressable
        testID={`message-${item.id}`}
        accessibilityRole="text"
        accessibilityHint={t('messages.longPressHint')}
        accessibilityActions={[{ name: 'longpress', label: t('messages.options') }]}
        onAccessibilityAction={onLongPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.unsent && styles.bubbleUnsent]}
      >
        <Text style={[styles.body, item.unsent && styles.unsent]} selectable={false}>
          {item.unsent ? t('messages.unsent') : item.body}
        </Text>
      </Pressable>
      {item.liked ? (
        <View testID={`message-liked-${item.id}`} style={[styles.heart, mine ? { marginRight: space.sm } : { marginLeft: space.sm }]}>
          <Ionicons name="heart" size={12} color={colors.danger} />
        </View>
      ) : null}
    </View>
  );
}

/** Miniatura da vibe respondida (foto, vídeo ou texto no fundo colorido). */
function VibeThumb({ item }: { item: DmMessage }) {
  const media = useVibeMedia(item.vibe_kind === 'photo' ? item.vibe_media_path : null);
  if (item.vibe_kind === 'photo') {
    return <View style={styles.thumb}>{media.data ? <Image source={{ uri: media.data }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>;
  }
  if (item.vibe_kind === 'video') {
    return (
      <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="play" size={22} color={colors.text} />
      </View>
    );
  }
  return (
    <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center', padding: 6 }]}>
      <VibeBackground style={item.vibe_style ?? 'violet'} />
      <Text style={styles.thumbText} numberOfLines={5}>
        {item.vibe_text ?? ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, flexShrink: 1 },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  listContent: { paddingHorizontal: space.md, paddingVertical: space.md, gap: 2, flexGrow: 1 },
  intro: { alignItems: 'center', gap: space.xs, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  introName: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, marginTop: space.sm },
  stamp: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center', marginVertical: space.md },
  line: { marginVertical: 2, maxWidth: '78%' },
  lineMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  lineTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  bubbleUnsent: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: colors.text },
  unsent: { fontStyle: 'italic', color: colors.textMuted },
  heart: {
    marginTop: -6,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.background,
  },
  seen: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 2, marginRight: space.xs },
  vibeReply: { gap: 4, marginBottom: 4 },
  vibeLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  thumb: { width: 84, height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card },
  thumbGone: { height: 64, width: 150, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: colors.border },
  thumbGoneText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  thumbText: { fontFamily: fonts.bold, fontSize: 11, color: '#FFFFFF', textAlign: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 140,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  request: { gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  requestActions: { flexDirection: 'row', gap: space.md },
  requestButton: { flex: 1, height: 44, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  requestGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  requestText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  cannot: { textAlign: 'center', paddingHorizontal: space.lg, paddingTop: space.md },
});
