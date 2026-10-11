import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Platform, RefreshControl, Text, View } from 'react-native';
import { blockUser, deletePost, report } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatError } from '../lib/errors';
import { useToggleLike } from '../lib/queries';
import type { FeedItem } from '../lib/types';
import { colors, space, text } from '../theme';
import { PostActions, type PostAction } from './PostActions';
import { PostCard } from './PostCard';

function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Soundora', message);
}

/** Lista de posts com curtir, comentários e o menu de denúncia/bloqueio. */
export function PostList({
  items,
  loading,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
  header,
  emptyText,
}: {
  items: FeedItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  loadingMore?: boolean;
  header?: ReactElement;
  emptyText: string;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const qc = useQueryClient();
  const toggleLike = useToggleLike();
  const [menuFor, setMenuFor] = useState<FeedItem | null>(null);

  const handleAction = async (action: PostAction) => {
    const item = menuFor;
    setMenuFor(null);
    if (!item) return;
    if (action.type === 'vibe') {
      // Compartilhar o post no Vibes: a tela de criar recebe o que precisa para a prévia.
      router.push({
        pathname: '/vibes/new',
        params: {
          postId: item.id,
          postUser: item.author_username,
          postAvatar: item.author_avatar_url ?? '',
          postBody: item.body,
          postUrl: item.preview_url,
          postPlatform: item.preview_platform,
          postTitle: item.preview_title,
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
      } else {
        await deletePost(item.id);
      }
      await qc.invalidateQueries();
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
        renderItem={({ item }) => (
          <PostCard
            item={item}
            onToggleLike={(p) => toggleLike.mutate(p)}
            onMore={setMenuFor}
            onOpenComments={(p) => router.push(`/post/${p.id}`)}
            onOpen={(p) => router.push(`/post/${p.id}`)}
          />
        )}
        ListEmptyComponent={<Text style={[text.body, { textAlign: 'center', marginTop: space.xxl, color: colors.textMuted }]}>{emptyText}</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} /> : null}
      />
      <PostActions
        visible={!!menuFor}
        username={menuFor?.author_username ?? ''}
        isMine={!!menuFor && menuFor.author_id === session?.user.id}
        onClose={() => setMenuFor(null)}
        onAction={handleAction}
      />
    </>
  );
}
