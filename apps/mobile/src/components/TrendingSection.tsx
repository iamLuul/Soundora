import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORM_LABELS } from '@soundora/core';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chartTrackLink, fetchTopAlbums, fetchWorldChart, type ChartTrack } from '../lib/api';
import { formatError } from '../lib/errors';
import { keys } from '../lib/queries';
import { colors, fonts, space, text } from '../theme';
import { useStreamingOpener } from './StreamingOpener';
import { TopAlbumList } from './TopAlbums';
import { WorldChartList } from './WorldChart';

type TrendingView = 'global' | 'reviews';

/**
 * Figma: Trending Page — duas visualizações:
 * - Top Global: as mais tocadas no mundo (Last.fm); cada música abre na plataforma da pessoa.
 * - Top Reviews: os álbuns com as maiores médias nas reviews do Soundora; abre o álbum.
 */
export function TrendingSection() {
  const { t } = useTranslation();
  const [view, setView] = useState<TrendingView>('global');
  const chart = useQuery({ queryKey: keys.worldChart, queryFn: fetchWorldChart, staleTime: 10 * 60_000, enabled: view === 'global' });
  const top = useQuery({ queryKey: ['top-albums'], queryFn: () => fetchTopAlbums(), staleTime: 60_000, enabled: view === 'reviews' });
  const { open, opening, message, platform, chooser } = useStreamingOpener((target, choice) => chartTrackLink(target.key, choice));
  const onPress = (item: ChartTrack) => open({ key: item.key, title: item.title, artist: item.artist });

  const toggle = (
    <View style={styles.toggle} accessibilityRole="tablist">
      {(['global', 'reviews'] as const).map((v) => (
        <Pressable
          key={v}
          testID={`trending-view-${v}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: view === v }}
          onPress={() => setView(v)}
          style={[styles.toggleItem, view === v && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>{t(`trending.${v}`)}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (view === 'reviews') {
    return (
      <TopAlbumList
        header={
          <View style={{ gap: space.xs, paddingBottom: space.md }}>
            {toggle}
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t('trending.reviewsTitle')}
            </Text>
            <Text style={text.small}>{t('trending.reviewsHint')}</Text>
          </View>
        }
        items={top.data ?? []}
        loading={top.isLoading}
        error={top.isError ? formatError(t, top.error) : t('trending.reviewsEmpty')}
        failed={top.isError}
        onRefresh={() => top.refetch()}
        onPress={(a) => router.push(`/album/${a.album_id}`)}
      />
    );
  }

  const header = (
    <View style={{ gap: space.xs, paddingBottom: space.md }}>
      {toggle}
      <View style={styles.trendingTitle}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('trending.title')}
        </Text>
        <View style={styles.weekChip}>
          <Ionicons name="calendar-outline" size={12} color={colors.text} />
          <Text style={styles.weekText}>{t('trending.thisWeek')}</Text>
        </View>
      </View>
      <Text style={text.small}>
        {platform ? t('trending.opensIn', { platform: PLATFORM_LABELS[platform] }) : t('trending.source')}
        {platform ? (
          <Text testID="trending-change-platform" style={styles.link} onPress={() => router.push('/settings/streaming')} accessibilityRole="link">
            {'  '}
            {t('trending.change')}
          </Text>
        ) : null}
      </Text>
      {message ? <Text style={[text.small, { color: colors.danger }]}>{message}</Text> : null}
    </View>
  );

  return (
    <>
      <WorldChartList
        header={header}
        items={chart.data?.entries ?? []}
        loading={chart.isLoading}
        error={chart.isError ? formatError(t, chart.error) : t('trending.empty')}
        failed={chart.isError}
        onRefresh={() => chart.refetch()}
        onPress={onPress}
        openingKey={opening}
      />
      {chooser}
    </>
  );
}

const styles = StyleSheet.create({
  trendingTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  weekChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.text,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  link: { color: colors.muted, fontFamily: fonts.semibold },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: space.lg,
    gap: space.md,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, textAlign: 'center' },
  weekText: { fontFamily: fonts.regular, fontSize: 10, color: colors.text },
  toggle: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: colors.handle, padding: 3, marginBottom: space.sm },
  toggleItem: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999 },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  toggleTextActive: { color: '#FFFFFF' },
});
