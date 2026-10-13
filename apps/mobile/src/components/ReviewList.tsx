import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';
import { type AlbumReview, blockUser, deleteReview, report, trackLink } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatError } from '../lib/errors';
import { uniqueBy } from '../lib/hooks';
import { listPerf } from '../lib/list';
import { removeReviewFromCache, reviewKeys, type ReviewFilter, useReviews, useToggleReviewLike } from '../lib/reviews';
import { colors, space, text } from '../theme';
import { PostActions, type PostAction } from './PostActions';
import { PullToRefresh } from './PullToRefresh';
import { ReviewCard } from './ReviewCard';
import { PostSkeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { useStreamingOpener } from './StreamingOpener';
import { confirmAction, notify } from '../lib/dialogs';
import { showToast } from './Toast';
import { ErrorState } from './ErrorState';


/** Lista de reviews (da mais nova à mais velha), com curtir, menu e abrir o álbum. */
export function ReviewList({
  filter = {},
  header,
  padded = false,
  emptyText,
  onRefresh,
}: {
  filter?: ReviewFilter;
  header?: ReactElement;
  /** Margem dos lados (quando a tela não tem; o cabeçalho pode sangrar até a borda). */
  padded?: boolean;
  emptyText?: string;
  /** Também recarrega o resto da tela ao puxar. */
  onRefresh?: () => unknown;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { session } = useAuth();
  const reviews = useReviews(filter);
  const toggleLike = useToggleReviewLike();
  const [menuFor, setMenuFor] = useState<AlbumReview | null>(null);
  const items = uniqueBy(reviews.data?.pages.flat() ?? [], (r) => r.id, 'reviews');
  const { open, opening, message, chooser } = useStreamingOpener((target, choice) => trackLink(target.key, choice));

  const handleAction = async (action: PostAction) => {
    const item = menuFor;
    setMenuFor(null);
    if (!item) return;
    try {
      if (action.type === 'report') {
        await report('review', item.id, action.reason);
        showToast(t('feed.reported'));
      } else if (action.type === 'block') {
        await blockUser(item.author_id);
        showToast(t('feed.blocked', { username: item.author_username }));
        await qc.invalidateQueries();
      } else if (action.type === 'delete') {
        if (!(await confirmAction(t('confirm.deleteReview'), t('confirm.delete'), t('common.cancel')))) return;
        await deleteReview(item.id);
        showToast(t('toast.reviewDeleted'));
        removeReviewFromCache(qc, item.id);
        void qc.invalidateQueries({ queryKey: reviewKeys.all });
        void qc.invalidateQueries({ queryKey: ['top-albums'] });
        void qc.invalidateQueries({ queryKey: ['album-summary'] });
      }
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <>
      <PullToRefresh onRefresh={() => Promise.all([reviews.refetch(), onRefresh?.()])}>
        <FlatList
          {...listPerf}
          testID="review-list"
          data={items}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <ReviewCard
              review={item}
              onToggleLike={(r) => toggleLike.mutate(r)}
              onMore={setMenuFor}
              onOpenAlbum={filter.album ? (r) => open({ key: r.album_id, title: r.album_title, artist: r.album_artist ?? '' }) : (r) => router.push(`/album/${r.album_id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: space.xxl, paddingHorizontal: padded ? space.lg : 0 }}
          onEndReached={() => reviews.hasNextPage && !reviews.isFetchingNextPage && reviews.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            reviews.isLoading ? (
              <PostSkeleton count={3} />
            ) : reviews.isError ? (
              <ErrorState message={formatError(t, reviews.error)} onRetry={() => reviews.refetch()} />
            ) : (
              <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.lg }]}>
                {emptyText ?? t('reviews.empty')}
              </Text>
            )
          }
          ListFooterComponent={reviews.isFetchingNextPage || opening ? <Spinner style={{ marginTop: space.md }} /> : <View />}
        />
      </PullToRefresh>
      {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center', paddingVertical: space.sm }]}>{message}</Text> : null}
      <PostActions
        visible={!!menuFor}
        username={menuFor?.author_username ?? ''}
        isMine={!!menuFor && menuFor.author_id === session?.user.id}
        allowVibe={false}
        deleteLabel={t('reviews.delete')}
        onClose={() => setMenuFor(null)}
        onAction={handleAction}
      />
      {chooser}
    </>
  );
}
