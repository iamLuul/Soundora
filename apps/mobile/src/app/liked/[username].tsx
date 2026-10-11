import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/figma';
import { PostList } from '../../components/PostList';
import { useLikedPosts } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';

/** Feed com os posts que a pessoa curtiu (do mais recente para o mais antigo). */
export default function LikedPostsScreen() {
  const { username, id } = useLocalSearchParams<{ username: string; id: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const liked = useLikedPosts(id);
  const items = liked.data?.pages.flat() ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {t('liked.title', { username })}
        </Text>
      </View>
      <PostList
        items={items}
        loading={liked.isLoading}
        refreshing={liked.isRefetching}
        onRefresh={() => liked.refetch()}
        onEndReached={() => liked.hasNextPage && !liked.isFetchingNextPage && liked.fetchNextPage()}
        loadingMore={liked.isFetchingNextPage}
        emptyText={t('liked.empty')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '70%' },
});
