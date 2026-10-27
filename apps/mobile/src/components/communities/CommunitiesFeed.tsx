import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatError } from '../../lib/errors';
import { useCommunityPosts, useMyCommunities } from '../../lib/queries';
import { colors, fonts, space, text } from '../../theme';
import { PostList } from '../PostList';
import { Button } from '../ui';
import { CommunityAvatar } from './CommunityAvatar';
import { CommunityStrip } from './CommunityStrip';

/**
 * Aba Comunidades do Início: os posts das comunidades de que a pessoa faz parte, todos
 * misturados ou de uma só (os chips de cima). Sem comunidade, convida para explorar.
 */
export function CommunitiesFeed({ active }: { active: boolean }) {
  const { t } = useTranslation();
  // Só busca quando a aba é aberta pela primeira vez.
  const [opened, setOpened] = useState(active);
  if (active && !opened) setOpened(true);
  const mine = useMyCommunities(opened);
  const [filter, setFilter] = useState<string | null>(null);
  const selected = filter && mine.data?.some((c) => c.id === filter) ? filter : null;
  const posts = useCommunityPosts(selected, opened);
  const items = posts.data?.pages.flat() ?? [];
  const modOf = useMemo(() => new Set((mine.data ?? []).filter((c) => c.role === 'owner' || c.role === 'moderator').map((c) => c.id)), [mine.data]);
  const none = mine.isSuccess && !mine.data.length;

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginHorizontal: -space.lg }}>
      <Pressable
        testID="community-filter-all"
        accessibilityRole="button"
        accessibilityState={{ selected: !selected }}
        onPress={() => setFilter(null)}
        style={[styles.chip, !selected && styles.chipOn]}
      >
        <Text style={styles.chipText}>{t('communities.all')}</Text>
      </Pressable>
      {(mine.data ?? []).map((c) => (
        <Pressable
          key={c.id}
          testID={`community-filter-${c.slug}`}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === c.id }}
          onPress={() => setFilter(c.id)}
          style={[styles.chip, selected === c.id && styles.chipOn]}
        >
          <CommunityAvatar name={c.name} color={c.color} size={20} />
          <Text style={styles.chipText} numberOfLines={1}>
            {c.name}
          </Text>
        </Pressable>
      ))}
      <Pressable testID="communities-explore" accessibilityRole="link" onPress={() => router.push('/communities')} style={[styles.chip, styles.explore]}>
        <Ionicons name="compass-outline" size={16} color={colors.text} />
        <Text style={styles.chipText}>{t('communities.explore')}</Text>
      </Pressable>
    </ScrollView>
  );

  const selectedCommunity = mine.data?.find((c) => c.id === selected);
  const header = (
    <View style={{ gap: space.sm, paddingTop: space.sm }}>
      {chips}
      {selectedCommunity ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(`/c/${selectedCommunity.slug}`)} style={styles.open}>
          <Text style={styles.openText}>{t('communities.openCommunity', { name: selectedCommunity.name })}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );

  if (none) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        <View style={styles.empty} testID="communities-empty">
          <Ionicons name="people-outline" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('communities.emptyTitle')}</Text>
          <Text style={[text.body, { color: colors.textMuted, textAlign: 'center' }]}>{t('communities.emptyBody')}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title={t('communities.explore')} size="sm" onPress={() => router.push('/communities')} />
            <Button title={t('communities.create')} size="sm" variant="ghost" onPress={() => router.push('/communities/new')} />
          </View>
        </View>
        <CommunityStrip />
      </ScrollView>
    );
  }

  return (
    <PostList
      header={header}
      items={items}
      loading={posts.isLoading || mine.isLoading || !opened}
      onRefresh={() => Promise.all([posts.refetch(), mine.refetch()])}
      onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
      loadingMore={posts.isFetchingNextPage}
      emptyText={t('communities.feedEmpty')}
      errorText={posts.isError ? formatError(t, posts.error) : null}
      modOf={modOf}
      hideCommunity={!!selected}
    />
  );
}

const styles = StyleSheet.create({
  chips: { gap: space.sm, paddingHorizontal: space.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    maxWidth: 200,
    paddingHorizontal: space.md,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  explore: { borderStyle: 'dashed' },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, flexShrink: 1 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  openText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, textAlign: 'center' },
});
