import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text } from 'react-native';
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
import { confirmAction, notify } from '../lib/dialogs';
import { showToast } from './Toast';
import { ErrorState } from './ErrorState';
import { AdPostCard } from './ads/AdPostCard';
import { withAds } from '../lib/ads';

/** Linha da lista: um post, o bloco extra no meio (ex.: contas sugeridas) ou um post anunciado. */
type Row = { kind: 'post'; item: FeedItem } | { kind: 'extra' } | { kind: 'ad'; slot: number };

/** Lista de posts com curtir, comentários e o menu de denúncia/bloqueio. */
export function PostList({
  items,
  loading,
  onRefresh,
  onEndReached,
  loadingMore,
  header,
  emptyText,
  errorText,
  empty,
  followable = false,
  interstitial,
  adsEvery = 0,
}: {
  items: FeedItem[];
  loading: boolean;
  /** Puxar para atualizar (o spinner fica até a promessa terminar). */
  onRefresh: () => unknown;
  onEndReached?: () => void;
  loadingMore?: boolean;
  header?: ReactElement;
  emptyText: string;
  /** Falhou ao carregar: mostra o motivo e "Tentar de novo" (que chama onRefresh). */
  errorText?: string | null;
  /** No lugar do texto de lista vazia. */
  empty?: ReactElement;
  /** Botão "Seguir" nos posts de quem eu ainda não sigo. */
  followable?: boolean;
  /** Bloco no meio da lista, depois de `after` posts (ou no fim, se houver menos). */
  interstitial?: { after: number; element: ReactElement };
  /** Post anunciado depois de cada N posts (0 ou sem: nenhum). Veja lib/ads.ts. */
  adsEvery?: number;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;
  const followingIds = useFollowingIds(followable);
  const follow = useFollow();
  // Só mostra o botão depois de saber quem eu sigo (senão ele piscaria em quem já sigo).
  const canFollow = (p: FeedItem) => followable && !!followingIds.data && p.author_id !== me && !followingIds.data.has(p.author_id);
  const posts = uniqueBy(items, (i) => i.id, 'posts');
  const rows: Row[] = withAds(posts, adsEvery).map((r) => (r.kind === 'item' ? { kind: 'post', item: r.item } : r));
  // O bloco extra entra logo depois do post número `after` (contando só posts, não anúncios).
  if (interstitial && posts.length) {
    const after = Math.min(interstitial.after, posts.length);
    const at = rows.findIndex((r) => r.kind === 'post' && r.item.id === posts[after - 1]!.id) + 1;
    rows.splice(at, 0, { kind: 'extra' });
  }
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
        showToast(t('feed.reported'));
      } else if (action.type === 'block') {
        await blockUser(item.author_id);
        showToast(t('feed.blocked', { username: item.author_username }));
      } else {
        if (!(await confirmAction(t('confirm.deletePost'), t('confirm.delete'), t('common.cancel')))) return;
        await deletePost(item.id);
        showToast(t('toast.postDeleted'));
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
          keyExtractor={(row) => (row.kind === 'post' ? row.item.id : row.kind === 'ad' ? `ad-${row.slot}` : 'extra')}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          renderItem={({ item: row }) => {
            if (row.kind === 'extra') return interstitial?.element ?? null;
            if (row.kind === 'ad') return <AdPostCard slot={row.slot} />;
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
            loading ? (
              <PostSkeleton />
            ) : errorText ? (
              <ErrorState message={errorText} onRetry={onRefresh} />
            ) : (
              (empty ?? <Text style={[text.body, { textAlign: 'center', marginTop: space.xxl, color: colors.textMuted }]}>{emptyText}</Text>)
            )
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <Spinner style={{ margin: space.lg }} /> : undefined}
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
