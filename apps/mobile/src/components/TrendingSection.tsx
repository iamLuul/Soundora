import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS, platformSearchUrl, type StreamingChoice } from '@soundora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { chartTrackLink, fetchWorldChart, setStreamingPlatform, type ChartTrack } from '../lib/api';
import { formatError } from '../lib/errors';
import { keys, useStreamingPlatform } from '../lib/queries';
import { colors, fonts, space, text } from '../theme';
import { StreamingPicker } from './StreamingPicker';
import { WorldChartList } from './WorldChart';

/** Figma: Trending Page — as mais tocadas no mundo (Last.fm); cada música abre na plataforma da pessoa. */
export function TrendingSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const chart = useQuery({ queryKey: keys.worldChart, queryFn: fetchWorldChart, staleTime: 10 * 60_000 });
  const platform = useStreamingPlatform();
  const [opening, setOpening] = useState<string | null>(null);
  const [pending, setPending] = useState<ChartTrack | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const open = async (item: ChartTrack, choice: StreamingChoice) => {
    setOpening(item.key);
    setMessage(null);
    let url: string;
    try {
      url = await chartTrackLink(item.key, choice);
    } catch {
      // Sem resposta do servidor: abre a busca da música na plataforma, que sempre funciona.
      url = platformSearchUrl(choice, item.title, item.artist);
    }
    try {
      // Na web, abre numa aba nova para o Soundora continuar aberto.
      if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer');
      else await Linking.openURL(url);
    } catch (err) {
      setMessage(formatError(t, err));
    } finally {
      setOpening(null);
    }
  };

  const onPress = (item: ChartTrack) => {
    if (platform.data) void open(item, platform.data);
    else setPending(item); // ainda não escolheu a plataforma (conta antiga): pergunta uma vez
  };

  const choose = async (choice: StreamingChoice) => {
    setSaving(true);
    try {
      await setStreamingPlatform(choice);
      qc.setQueryData(keys.streamingPlatform, choice);
      const item = pending;
      setPending(null);
      if (item) await open(item, choice);
    } catch (err) {
      setMessage(formatError(t, err));
      setPending(null);
    } finally {
      setSaving(false);
    }
  };

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
        {platform.data ? t('trending.opensIn', { platform: PLATFORM_LABELS[platform.data] }) : t('trending.source')}
        {platform.data ? (
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
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPending(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('streaming.title')}</Text>
            <Text style={[text.small, { textAlign: 'center' }]}>{t('streaming.hint')}</Text>
            <StreamingPicker value={null} onChange={choose} disabled={saving} />
          </Pressable>
        </Pressable>
      </Modal>
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
