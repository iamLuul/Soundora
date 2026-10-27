import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/figma';
import { PostActions, type PostAction } from '../../components/PostActions';
import { PostCard } from '../../components/PostCard';
import { ErrorText, keyboardBehavior, useKeyboardVisible } from '../../components/ui';
import { addComment, blockUser, deletePost, fetchComments, report, setCommentLiked } from '../../lib/api';
import type { CommentRow } from '../../lib/types';
import { CommentItem, RepliesToggle } from '../../components/CommentItem';
import { buildCommentRows } from '../../lib/comment-thread';
import { useAuth } from '../../lib/auth';
import { errorStatus, formatError } from '../../lib/errors';
import { ErrorScreen } from '../../components/ErrorScreen';
import { keys, usePost, useToggleLike } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';
import { CommentsSkeleton, PostSkeleton } from '../../components/Skeleton';
import { listPerf } from '../../lib/list';
import { webTouch } from '../../lib/touch';
import { Spinner } from '../../components/Spinner';
import { confirmAction, notify } from '../../lib/dialogs';
import { showToast } from '../../components/Toast';
import { ErrorState } from '../../components/ErrorState';

/** Post aberto em tela cheia, com os comentários embaixo e a caixa de responder fixa (como no X). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardVisible();
  const qc = useQueryClient();
  const { session, signOut } = useAuth();
  const post = usePost(id);
  const comments = useQuery({ queryKey: keys.comments(id), queryFn: () => fetchComments(id) });
  const toggleLike = useToggleLike();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Respondendo a um comentário: o principal (onde a resposta fica) e o @ de quem é respondido.
  const [replyTo, setReplyTo] = useState<{ rootId: string; username: string } | null>(null);
  const input = useRef<TextInputInstance>(null);
  // Conversas grandes que a pessoa abriu ("Ver mais").
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => buildCommentRows(comments.data ?? [], expanded), [comments.data, expanded]);
  const toggleThread = (rootId: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });

  const startReply = (c: CommentRow) => {
    setReplyTo({ rootId: c.parent_id ?? c.id, username: c.author_username });
    setBody((b) => (b.startsWith(`@${c.author_username} `) ? b : `@${c.author_username} `));
    input.current?.focus();
  };

  const toggleCommentLike = async (c: CommentRow) => {
    const key = keys.comments(id);
    const before = qc.getQueryData<CommentRow[]>(key);
    const patch = (r: CommentRow) =>
      r.id === c.id ? { ...r, liked_by_me: !c.liked_by_me, like_count: Math.max(0, r.like_count + (c.liked_by_me ? -1 : 1)) } : r;
    qc.setQueryData<CommentRow[]>(key, (rows) => rows?.map(patch));
    try {
      await setCommentLiked(c.id, !c.liked_by_me);
    } catch (err) {
      qc.setQueryData(key, before);
      notify(formatError(t, err));
    }
  };

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await addComment(id, body, replyTo?.rootId ?? null);
      // Respondeu numa conversa recolhida: abre, para a resposta aparecer.
      const rootId = replyTo?.rootId;
      if (rootId) setExpanded((s) => new Set(s).add(rootId));
      setBody('');
      setReplyTo(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.comments(id) }),
        qc.invalidateQueries({ queryKey: keys.post(id) }),
        qc.invalidateQueries({ queryKey: keys.feed }),
      ]);
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (action: PostAction) => {
    setMenuOpen(false);
    const item = post.data;
    if (!item) return;
    if (action.type === 'vibe') {
      router.push({
        pathname: '/vibes/new',
        params: {
          postId: item.id,
          postUser: item.author_username,
          postAvatar: item.author_avatar_url ?? '',
          postBody: item.body,
          postUrl: item.preview_url ?? '',
          postPlatform: item.preview_platform ?? '',
          postTitle: item.preview_title ?? '',
          postArtist: item.preview_artist ?? '',
          postImage: item.preview_image_url ?? '',
        },
      });
      return;
    }
    try {
      if (action.type === 'report') {
        await report('post', item.id, action.reason);
        showToast(t('feed.reported'));
      } else if (action.type === 'block') {
        await blockUser(item.author_id);
        showToast(t('feed.blocked', { username: item.author_username }));
        router.back();
      } else {
        if (!(await confirmAction(t('confirm.deletePost'), t('confirm.delete'), t('common.cancel')))) return;
        await deletePost(item.id);
        showToast(t('toast.postDeleted'));
        router.back();
      }
      await qc.invalidateQueries();
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={keyboardBehavior}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header">
          {t('post.title')}
        </Text>
      </View>

      {post.isLoading ? (
        <View style={{ paddingHorizontal: space.lg }}>
          <PostSkeleton count={1} />
          <CommentsSkeleton />
        </View>
      ) : post.isError ? (
        [401, 403, 404].includes(errorStatus(post.error)) ? (
          <ErrorScreen code={errorStatus(post.error) as 401 | 403 | 404} fullScreen={false} onSignIn={signOut} />
        ) : (
          <ErrorState message={formatError(t, post.error)} onRetry={() => post.refetch()} />
        )
      ) : !post.data ? (
        <ErrorScreen code={404} fullScreen={false} testID="post-gone" />
      ) : (
        <FlatList
          {...listPerf}
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
          ListHeaderComponent={
            <>
              <PostCard item={post.data} expanded onToggleLike={(p) => toggleLike.mutate(p)} onMore={() => setMenuOpen(true)} />
              <Text style={styles.section}>{t('post.comments', { count: post.data.comment_count })}</Text>
            </>
          }
          ListEmptyComponent={comments.isLoading ? <CommentsSkeleton /> : <Text style={styles.empty}>{t('post.noComments')}</Text>}
          renderItem={({ item: row }) =>
            row.kind === 'toggle' ? (
              <RepliesToggle rootId={row.rootId} hidden={row.hidden} expanded={row.expanded} onPress={() => toggleThread(row.rootId)} />
            ) : (
              <CommentItem item={row.item} onToggleLike={toggleCommentLike} onReply={startReply} continues={row.continues} />
            )
          }
        />
      )}

      {post.data ? (
        <View style={[styles.composer, { paddingBottom: (keyboardOpen ? 0 : insets.bottom) + space.sm }]}>
          <ErrorText>{error}</ErrorText>
          {replyTo ? (
            <View style={styles.replying}>
              <Text style={styles.replyingText}>{t('post.replyingTo', { username: replyTo.username })}</Text>
              <Pressable
                testID="cancel-reply"
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                hitSlop={10}
                style={webTouch(10)}
                onPress={() => {
                  setReplyTo(null);
                  setBody((b) => b.replace(new RegExp(`^@${replyTo.username} `), ''));
                }}
              >
                <Text style={styles.replyingCancel}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              ref={input}
              testID="comment-input"
              accessibilityLabel={t('a11y.comment')}
              value={body}
              onChangeText={setBody}
              placeholder={t('post.replyPlaceholder', { username: post.data.author_username })}
              placeholderTextColor={colors.placeholder}
              maxLength={300}
              multiline
              style={styles.input}
            />
            <Pressable
              testID="comment-send"
              accessibilityRole="button"
              accessibilityLabel={t('post.send')}
              onPress={send}
              disabled={sending || !body.trim()}
              style={[styles.send, (sending || !body.trim()) && { opacity: 0.5 }]}
            >
              {sending ? <Spinner size={18} color={colors.text} /> : <Text style={styles.sendText}>{t('post.send')}</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {post.data ? (
        <PostActions
          visible={menuOpen}
          username={post.data.author_username}
          isMine={post.data.author_id === session?.user.id}
          onClose={() => setMenuOpen(false)}
          onAction={handleAction}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  gone: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  section: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.tabBar },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, paddingVertical: space.md },
  replying: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: space.xs },
  replyingText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  replyingCancel: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted },
  composer: { borderTopWidth: 1, borderTopColor: colors.tabBar, paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.background },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    outlineWidth: 0,
  },
  send: { height: 40, paddingHorizontal: space.lg, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
});
