import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader, RingAvatar } from '../../components/figma';
import { PostActions, type PostAction } from '../../components/PostActions';
import { PostCard } from '../../components/PostCard';
import { ErrorText } from '../../components/ui';
import { addComment, blockUser, deletePost, fetchComments, report } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatError } from '../../lib/errors';
import { relativeTime } from '../../lib/i18n';
import { keys, usePost, useToggleLike } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';

function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Soundora', message);
}

/** Post aberto em tela cheia, com os comentários embaixo e a caixa de responder fixa (como no X). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuth();
  const post = usePost(id);
  const comments = useQuery({ queryKey: keys.comments(id), queryFn: () => fetchComments(id) });
  const toggleLike = useToggleLike();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await addComment(id, body);
      setBody('');
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
        notify(t('feed.reported'));
      } else if (action.type === 'block') {
        await blockUser(item.author_id);
        notify(t('feed.blocked', { username: item.author_username }));
        router.back();
      } else {
        await deletePost(item.id);
        router.back();
      }
      await qc.invalidateQueries();
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header">
          {t('post.title')}
        </Text>
      </View>

      {post.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
      ) : !post.data ? (
        <Text style={styles.gone}>{post.isError ? formatError(t, post.error) : t('post.gone')}</Text>
      ) : (
        <FlatList
          data={comments.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
          ListHeaderComponent={
            <>
              <PostCard item={post.data} expanded onToggleLike={(p) => toggleLike.mutate(p)} onMore={() => setMenuOpen(true)} />
              <Text style={styles.section}>{t('post.comments', { count: post.data.comment_count })}</Text>
            </>
          }
          ListEmptyComponent={comments.isLoading ? <ActivityIndicator color={colors.muted} /> : <Text style={styles.empty}>{t('post.noComments')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.comment} testID={`comment-${item.id}`}>
              <Pressable accessibilityRole="link" onPress={() => item.author && router.push(`/u/${item.author.username}`)}>
                <RingAvatar uri={item.author?.avatar_url ?? null} name={item.author?.display_name ?? '?'} size={34} />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.author?.display_name} <Text style={styles.handle}>@{item.author?.username} · {relativeTime(item.created_at)}</Text>
                </Text>
                <Text style={styles.commentBody}>{item.body}</Text>
              </View>
            </View>
          )}
        />
      )}

      {post.data ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + space.sm }]}>
          <ErrorText>{error}</ErrorText>
          <View style={styles.composerRow}>
            <TextInput
              testID="comment-input"
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
              {sending ? <ActivityIndicator color={colors.text} /> : <Text style={styles.sendText}>{t('post.send')}</Text>}
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
  comment: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  commentBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
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
