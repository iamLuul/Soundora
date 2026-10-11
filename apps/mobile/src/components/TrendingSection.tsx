import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS } from '@soundora/core';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { chartTrackLink, fetchWorldChart, type ChartTrack } from '../lib/api';
import { formatError } from '../lib/errors';
import { keys } from '../lib/queries';
import { colors, fonts, space, text } from '../theme';
import { useStreamingOpener } from './StreamingOpener';
import { WorldChartList } from './WorldChart';

/** Figma: Trending Page — as mais tocadas no mundo (Last.fm); cada música abre na plataforma da pessoa. */
export function TrendingSection() {
  const { t } = useTranslation();
  const chart = useQuery({ queryKey: keys.worldChart, queryFn: fetchWorldChart, staleTime: 10 * 60_000 });
  const { open, opening, message, platform, chooser } = useStreamingOpener((target, choice) => chartTrackLink(target.key, choice));
  const onPress = (item: ChartTrack) => open({ key: item.key, title: item.title, artist: item.artist });

  const header = (
    <View style={{ gap: space.xs, paddingBottom: space.md }}>
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
        refreshing={chart.isRefetching}
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
  link: { color: colors.primary, fontFamily: fonts.semibold },
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
});
