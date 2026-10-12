import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Platform, Text } from 'react-native';
import { blockUser, deletePost, report } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatError } from '../lib/errors';
import { useFollow, useFollowingIds, useToggleLike } from '../lib/queries';
import type { FeedItem } from '../lib/types';
import { colors, space, text } from '../theme';
import { PostActions, type PostAction } from './PostActions';
import { PostCard } from './PostCard';
import { uniqueBy } from '../lib/hooks';
import { PostSkeleton } from './Skeleton';
import { listPerf } from '../lib/list';
import { PullToRefresh } from './PullToRefresh';
import { Spinner } from './Spinner';

function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Soundora', message);
}

/** Linha da lista: um post ou o bloco extra no meio (ex.: contas sugeridas). */
type Row = { kind: 'post'; item: FeedItem } | { kind: 'extra' };

/** Lista de posts com curtir, comentários e o menu de denúncia/bloqueio. */
export function PostList({
  items,
  loading,
  onRefresh,
  onEndReached,
  loadingMore,
  header,
  emptyText,
  empty,
  followable = false,
  interstitial,
}: {
  items: FeedItem[];
  loading: boolean;
  /** Puxar para atualizar (o spinner fica até a promessa terminar). */
  onRefresh: () => unknown;
  onEndReached?: () => void;
  loadingMore?: boolean;
  header?: ReactElement;
  emptyText: string;
  /** No lugar do texto de lista vazia. */
  empty?: ReactElement;
  /** Botão "Seguir" nos posts de quem eu ainda não sigo. */
  followable?: boolean;
  /** Bloco no meio da lista, depois de `after` posts (ou no fim, se houver menos). */
  interstitial?: { after: number; element: ReactElement };
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;
  const followingIds = useFollowingIds(followable);
  const follow = useFollow();
  // Só mostra o botão depois de saber quem eu sigo (senão ele piscaria em quem já sigo).
  const canFollow = (p: FeedItem) => followable && !!followingIds.data && p.author_id !== me && !followingIds.data.has(p.author_id);
  const posts = uniqueBy(items, (i) => i.id, 'posts');
  const rows: Row[] = posts.map((item) => ({ kind: 'post', item }));
  if (interstitial && posts.length) rows.splice(Math.min(interstitial.after, posts.length), 0, { kind: 'extra' });
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

  return (
    <>
      <PullToRefresh onRefresh={onRefresh}>
        <FlatList
          {...listPerf}
          data={rows}
          keyExtractor={(row) => (row.kind === 'post' ? row.item.id : 'extra')}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          renderItem={({ item: row }) => {
            if (row.kind === 'extra') return interstitial?.element ?? null;
            const item = row.item;
            return (
              <PostCard
                item={item}
                onFollow={canFollow(item) ? (p) => follow.mutate({ userId: p.author_id, follow: true }) : undefined}
                onToggleLike={(p) => toggleLike.mutate(p)}
                onMore={setMenuFor}
                onOpenComments={(p) => router.push(`/post/${p.id}`)}
                onOpen={(p) => router.push(`/post/${p.id}`)}
              />
            );
          }}
          ListEmptyComponent={
            loading ? <PostSkeleton /> : empty ?? <Text style={[text.body, { textAlign: 'center', marginTop: space.xxl, color: colors.textMuted }]}>{emptyText}</Text>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <Spinner style={{ margin: space.lg }} /> : null}
        />
      </PullToRefresh>
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
