import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/figma';
import { LikedSongRow } from '../../components/LikedSongRow';
import { useStreamingOpener } from '../../components/StreamingOpener';
import { swipeDiscover, trackLink } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatError } from '../../lib/errors';
import { keys, useProfileLikedSongs } from '../../lib/queries';
import type { LikedSong } from '../../lib/types';
import { colors, fonts, space, text } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { TrackListSkeleton } from '../../components/Skeleton';
import { listPerf } from '../../lib/list';
import { PullToRefresh } from '../../components/PullToRefresh';
import { Spinner } from '../../components/Spinner';
import { ErrorState } from '../../components/ErrorState';

/** Perfil › Curtidas: as músicas que a pessoa curtiu no Descobrir (a mais recente primeiro). */
export default function LikedSongsScreen() {
  const { username, id } = useLocalSearchParams<{ username: string; id: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isMe = !!profile && profile.id === id;
  const liked = useProfileLikedSongs(id);
  const items = uniqueBy(liked.data?.pages.flat() ?? [], (s) => s.link_preview_id, 'músicas curtidas');
  const { open, opening, message, chooser } = useStreamingOpener((target, choice) => trackLink(target.key, choice));

  const openSong = (s: LikedSong) => open({ key: s.link_preview_id, title: s.title, artist: s.artist ?? '' });

  const unlike = (song: LikedSong) => {
    qc.setQueryData<InfiniteData<LikedSong[]>>(keys.likedSongs(id), (d) =>
      d ? { ...d, pages: d.pages.map((p) => p.filter((s) => s.link_preview_id !== song.link_preview_id)) } : d,
    );
    qc.setQueryData<LikedSong[]>(['discover-liked'], (list) => list?.filter((s) => s.link_preview_id !== song.link_preview_id));
    swipeDiscover({ link_preview_id: song.link_preview_id, post_id: null }, false)
      .catch(() => undefined)
      .finally(() => {
        void qc.invalidateQueries({ queryKey: ['profile'] });
        void qc.invalidateQueries({ queryKey: ['discover-liked'] });
        void qc.invalidateQueries({ queryKey: keys.likedSongs(id) });
      });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {t('liked.title', { username })}
        </Text>
      </View>
      {message ? <Text style={[text.small, styles.message]}>{message}</Text> : null}
      <PullToRefresh onRefresh={() => liked.refetch()}>
        <FlatList
          {...listPerf}
          data={items}
          keyExtractor={(s) => s.link_preview_id}
          renderItem={({ item }) => <LikedSongRow song={item} onOpen={openSong} onUnlike={isMe ? unlike : undefined} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          onEndReached={() => liked.hasNextPage && !liked.isFetchingNextPage && liked.fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            liked.isLoading ? (
              <TrackListSkeleton count={8} cover={56} />
            ) : liked.isError ? (
              <ErrorState message={formatError(t, liked.error)} onRetry={() => liked.refetch()} />
            ) : (
              <Text style={[text.body, styles.empty]}>{t(isMe ? 'liked.emptyMine' : 'liked.empty')}</Text>
            )
          }
          ListFooterComponent={liked.isFetchingNextPage || opening ? <Spinner style={{ marginTop: space.md }} /> : undefined}
        />
      </PullToRefresh>
      {chooser}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '70%' },
  list: { paddingHorizontal: space.lg, paddingTop: space.md },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  message: { color: colors.danger, textAlign: 'center', paddingHorizontal: space.lg },
});
