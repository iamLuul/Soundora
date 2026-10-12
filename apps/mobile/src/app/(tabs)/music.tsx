import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchField, TopTabs } from '../../components/figma';
import { TrackRow } from '../../components/TrackRow';
import { useStreamingOpener } from '../../components/StreamingOpener';
import { fetchLikedTracks, fetchMyTracks, trackLink } from '../../lib/api';
import { colors, fonts, space, text } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { TrackListSkeleton } from '../../components/Skeleton';
import { listPerf } from '../../lib/list';

type Tab = 'liked' | 'mine';

/**
 * Músicas (Figma: Music page/Playlists): as que você curtiu no Descobrir e as que postou.
 * Tocar abre a música na plataforma de streaming que a pessoa escolheu.
 */
export default function MusicScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('liked');
  const [query, setQuery] = useState('');
  const tracks = useQuery({ queryKey: ['my-music', tab], queryFn: tab === 'liked' ? fetchLikedTracks : fetchMyTracks });

  const { open, opening, message, platform, chooser } = useStreamingOpener((target, choice) => trackLink(target.key, choice));

  const q = query.trim().toLowerCase();
  const items = uniqueBy(tracks.data ?? [], (x) => x.link_preview_id, 'músicas').filter((x) => !q || x.title.toLowerCase().includes(q) || x.artist?.toLowerCase().includes(q));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'liked', label: t('music.liked') },
          { value: 'mine', label: t('music.mine') },
        ]}
      />
      <FlatList
        {...listPerf}
        data={items}
        keyExtractor={(i) => i.link_preview_id}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingVertical: space.md }}>
            <Text style={styles.title}>{tab === 'liked' ? t('music.likedTitle') : t('music.mineTitle')}</Text>
            <SearchField placeholder={t('music.search')} value={query} onChangeText={setQuery} />
          </View>
        }
        renderItem={({ item }) => (
          <TrackRow
            item={item}
            platform={platform}
            onPress={(x) => open({ key: x.link_preview_id, title: x.title, artist: x.artist ?? '' })}
          />
        )}
        ListEmptyComponent={
          tracks.isLoading ? (
            <TrackListSkeleton count={8} />
          ) : (
            <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl }]}>
              {tracks.isError ? t('common.error') : t('music.empty')}
            </Text>
          )
        }
        refreshControl={<RefreshControl refreshing={tracks.isRefetching} onRefresh={() => tracks.refetch()} tintColor={colors.primary} />}
        ListFooterComponent={opening ? <ActivityIndicator color={colors.primary} style={{ marginTop: space.md }} /> : null}
      />
      {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center', paddingVertical: space.sm }]}>{message}</Text> : null}
      {chooser}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.md },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
});
