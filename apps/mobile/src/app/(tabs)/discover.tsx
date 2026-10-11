import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopTabs } from '../../components/figma';
import { DiscoverDeck } from '../../components/DiscoverDeck';
import { SearchPanel } from '../../components/SearchPanel';
import { TrendingSection } from '../../components/TrendingSection';
import { Button } from '../../components/ui';
import { fetchDiscoverCards, swipeDiscover } from '../../lib/api';
import { genreLabel, keys, useGenres } from '../../lib/queries';
import type { DiscoverCard } from '../../lib/types';
import { colors, space, text } from '../../theme';

type Section = 'discover' | 'trending' | 'search';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>('discover');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Figma: Search page — abas Discover | Trending | Search e o sino */}
      <TopTabs<Section>
        value={section}
        onChange={setSection}
        style={styles.header}
        tabs={[
          { value: 'discover', label: t('discover.segDiscover') },
          { value: 'trending', label: t('discover.segTrending') },
          { value: 'search', label: t('discover.segSearch') },
        ]}
      />
      <View style={styles.body}>
        {section === 'discover' ? <DiscoverSection /> : section === 'trending' ? <TrendingSection /> : <SearchPanel />}
      </View>
    </View>
  );
}

function DiscoverSection() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const genres = useGenres();
  const cards = useQuery({ queryKey: ['discover'], queryFn: () => fetchDiscoverCards(20), staleTime: Infinity });
  const [gone, setGone] = useState<Set<string>>(new Set());
  const remaining = (cards.data ?? []).filter((c) => !gone.has(c.link_preview_id));

  const onSwipe = (card: DiscoverCard, liked: boolean) => {
    setGone((s) => new Set(s).add(card.link_preview_id));
    // Grava em segundo plano; se falhar, a música só volta a aparecer depois.
    swipeDiscover(card, liked)
      .then(() => (liked ? qc.invalidateQueries({ queryKey: keys.feed }) : undefined))
      .catch(() => undefined);
  };

  const reload = async () => {
    setGone(new Set());
    await cards.refetch();
  };

  if (cards.isLoading) return <ActivityIndicator color={colors.primary} style={{ marginTop: space.xxl }} />;

  if (!remaining.length) {
    return (
      <View style={styles.empty}>
        <Text style={[text.body, { textAlign: 'center', color: colors.textMuted }]}>{cards.isError ? t('common.error') : t('discover.empty')}</Text>
        <Button title={t('discover.reload')} variant="ghost" onPress={reload} loading={cards.isFetching} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, gap: space.sm }}>
      <Text style={[text.small, { textAlign: 'center' }]}>{t('discover.hint')}</Text>
      <DiscoverDeck cards={remaining} genreName={(slug) => genreLabel(genres.data, slug, i18n.language)} onSwipe={onSwipe} onShuffle={reload} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { marginHorizontal: space.lg },
  body: { flex: 1, paddingHorizontal: space.md, paddingTop: space.sm, maxWidth: 640, width: '100%', alignSelf: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
});
