import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchField, TopTabs } from '../../components/figma';
import { TrackRow } from '../../components/TrackRow';
import { fetchLikedTracks, fetchMyTracks } from '../../lib/api';
import { colors, fonts, space, text } from '../../theme';

type Tab = 'liked' | 'mine';

/**
 * Músicas (Figma: Music page/Playlists): as que você curtiu no Descobrir e as que postou.
 * Tocar abre a música no streaming de origem.
 */
export default function MusicScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('liked');
  const [query, setQuery] = useState('');
  const tracks = useQuery({ queryKey: ['my-music', tab], queryFn: tab === 'liked' ? fetchLikedTracks : fetchMyTracks });

  const q = query.trim().toLowerCase();
  const items = (tracks.data ?? []).filter((x) => !q || x.title.toLowerCase().includes(q) || x.artist?.toLowerCase().includes(q));

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
        data={items}
        keyExtractor={(i) => i.link_preview_id}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingVertical: space.md }}>
            <Text style={styles.title}>{tab === 'liked' ? t('music.likedTitle') : t('music.mineTitle')}</Text>
            <SearchField placeholder={t('music.search')} value={query} onChangeText={setQuery} />
          </View>
        }
        renderItem={({ item }) => <TrackRow item={item} />}
        ListEmptyComponent={
          tracks.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
          ) : (
            <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl }]}>
              {tracks.isError ? t('common.error') : t('music.empty')}
            </Text>
          )
        }
        refreshControl={<RefreshControl refreshing={tracks.isRefetching} onRefresh={() => tracks.refetch()} tintColor={colors.primary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.md },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
});
