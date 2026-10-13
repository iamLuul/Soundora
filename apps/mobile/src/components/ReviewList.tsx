import { useQueryClient } from '@tanstack/react-query';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Platform, Text, View } from 'react-native';
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

function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Soundora', message);
}

/** Lista de reviews (da mais nova à mais velha), com curtir, menu e abrir o álbum. */
export function ReviewList({ filter = {}, header }: { filter?: ReviewFilter; header?: ReactElement }) {
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
        notify(t('feed.reported'));
      } else if (action.type === 'block') {
        await blockUser(item.author_id);
        notify(t('feed.blocked', { username: item.author_username }));
        await qc.invalidateQueries();
      } else if (action.type === 'delete') {
        await deleteReview(item.id);
        removeReviewFromCache(qc, item.id);
        void qc.invalidateQueries({ queryKey: reviewKeys.all });
      }
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <>
      <PullToRefresh onRefresh={() => reviews.refetch()}>
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
              onOpenAlbum={(r) => open({ key: r.album_id, title: r.album_title, artist: r.album_artist ?? '' })}
            />
          )}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          onEndReached={() => reviews.hasNextPage && !reviews.isFetchingNextPage && reviews.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            reviews.isLoading ? (
              <PostSkeleton count={3} />
            ) : (
              <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.lg }]}>
                {reviews.isError ? formatError(t, reviews.error) : t('reviews.empty')}
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
