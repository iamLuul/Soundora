import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PostList } from '../../components/PostList';
import { useFeed } from '../../lib/queries';
import { colors } from '../../theme';

export default function FeedScreen() {
  const { t } = useTranslation();
  const feed = useFeed();
  const items = feed.data?.pages.flat() ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PostList
        items={items}
        loading={feed.isLoading}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => feed.refetch()}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        loadingMore={feed.isFetchingNextPage}
        emptyText={feed.isError ? t('common.error') : t('feed.empty')}
      />
    </View>
  );
}
