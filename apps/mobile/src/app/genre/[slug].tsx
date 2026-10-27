import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/figma';
import { PostList } from '../../components/PostList';
import { formatError } from '../../lib/errors';
import { uniqueBy } from '../../lib/hooks';
import { genreLabel, prettyGenre, useGenre, useGenrePosts } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';

/** Buscar › gênero: os posts marcados com o gênero, do mais novo ao mais velho. */
export default function GenrePostsScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const genre = useGenre(slug);
  const posts = useGenrePosts(slug);
  const items = uniqueBy(posts.data?.pages.flat() ?? [], (p) => p.id, 'posts do gênero');
  const name = (genre.data ? genreLabel([genre.data], slug, i18n.language) : null) ?? prettyGenre(slug);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text testID="genre-title" style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {t('search.genreTitle', { genre: name })}
        </Text>
      </View>
      <PostList
        items={items}
        loading={posts.isLoading}
        onRefresh={() => posts.refetch()}
        onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
        loadingMore={posts.isFetchingNextPage}
        emptyText={t('search.genreEmpty')}
        errorText={posts.isError ? formatError(t, posts.error) : null}
        followable
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '70%' },
});
