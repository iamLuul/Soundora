import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fetchProfileSummary, setFollowing } from '../lib/api';
import { keys, useProfilePosts } from '../lib/queries';
import { colors, space, text } from '../theme';
import { PostList } from './PostList';
import { Avatar, Button } from './ui';

/** Cabeçalho do perfil + posts. Usado na aba "Perfil" e em /u/[username]. */
export function ProfileView({ username, footer }: { username: string; footer?: React.ReactNode }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: keys.profile(username), queryFn: () => fetchProfileSummary(username) });
  const posts = useProfilePosts(summary.data?.id);

  if (summary.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: space.xxl }} />;
  const p = summary.data;
  if (!p) return <Text style={[text.body, { textAlign: 'center', marginTop: space.xxl }]}>{t('common.error')}</Text>;

  const toggleFollow = async () => {
    await setFollowing(p.id, !p.i_follow);
    await qc.invalidateQueries({ queryKey: keys.profile(username) });
    await qc.invalidateQueries({ queryKey: keys.feed });
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.top}>
        <Avatar uri={p.avatar_url} name={p.display_name} size={72} />
        <View style={styles.counts}>
          <Count label={t('profile.posts')} value={p.posts} />
          <Count label={t('profile.followers')} value={p.followers} />
          <Count label={t('profile.following')} value={p.following} />
        </View>
      </View>
      <View>
        <Text style={text.title}>{p.display_name}</Text>
        <Text style={text.small}>@{p.username}</Text>
      </View>
      {p.bio ? <Text style={text.body}>{p.bio}</Text> : null}
      {!p.is_me ? (
        <Button testID="follow-button" title={p.i_follow ? t('profile.unfollow') : t('profile.follow')} variant={p.i_follow ? 'ghost' : 'primary'} onPress={toggleFollow} />
      ) : null}
      {footer}
    </View>
  );

  return (
    <PostList
      header={header}
      items={posts.data?.pages.flat() ?? []}
      loading={false}
      refreshing={posts.isRefetching}
      onRefresh={() => {
        summary.refetch();
        posts.refetch();
      }}
      onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
      loadingMore={posts.isFetchingNextPage}
      emptyText={t('profile.noPosts')}
    />
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={text.subtitle}>{value}</Text>
      <Text style={text.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingVertical: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  counts: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
});
