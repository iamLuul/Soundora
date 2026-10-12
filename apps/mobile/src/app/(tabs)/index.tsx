import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopTabs } from '../../components/figma';
import { FollowingRow } from '../../components/FollowingRow';
import { PostList } from '../../components/PostList';
import { useFeed } from '../../lib/queries';
import { colors, space } from '../../theme';

/** Início (Figma: Home page/For You): abas do topo com o sino, quem você segue e o feed. */
export default function FeedScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const feed = useFeed();
  const items = feed.data?.pages.flat() ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <TopTabs tabs={[{ value: 'feed', label: t('tabs.feed') }]} value="feed" style={{ marginHorizontal: space.lg }} />
      <PostList
        header={<FollowingRow />}
        items={items}
        loading={feed.isLoading}
        onRefresh={() => feed.refetch()}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        loadingMore={feed.isFetchingNextPage}
        emptyText={feed.isError ? t('common.error') : t('feed.empty')}
      />
    </View>
  );
}
