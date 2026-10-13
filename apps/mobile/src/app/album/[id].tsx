import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/figma';
import { ReviewList } from '../../components/ReviewList';
import { Stars } from '../../components/StarRating';
import { fetchAlbumSummary } from '../../lib/api';
import { formatRating } from '../../lib/reviews';
import { colors, fonts, space } from '../../theme';

/** Um álbum: capa, média das notas, posição no Top Reviews e todas as reviews dele. */
export default function AlbumScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const summary = useQuery({ queryKey: ['album-summary', id], queryFn: () => fetchAlbumSummary(id), enabled: !!id });
  const a = summary.data;

  const header = a ? (
    <View testID="album-header" style={styles.header}>
      {a.image_url ? (
        <Image source={{ uri: a.image_url }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Ionicons name="disc-outline" size={40} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={3}>
          {a.title}
        </Text>
        {a.artist ? <Text style={styles.artist}>{a.artist}</Text> : null}
        {a.year ? <Text style={styles.year}>{a.year}</Text> : null}
        <View style={styles.scoreRow} accessible accessibilityLabel={t('trending.averageLabel', { average: formatRating(a.average, i18n.language) })}>
          <Ionicons name="star" size={18} color={colors.text} />
          <Text testID="album-average" style={styles.average}>
            {formatRating(a.average, i18n.language)}
            <Text style={styles.outOf}>/10</Text>
          </Text>
        </View>
        <Stars rating={a.average} size={14} gap={3} />
        <Text style={styles.count}>
          #{a.rank} · {t('trending.reviewCount', { count: a.review_count })}
        </Text>
      </View>
    </View>
  ) : summary.isSuccess ? (
    <Text style={styles.empty}>{t('album.noReviews')}</Text>
  ) : (
    <View />
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <BackHeader />
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
          {a?.title ?? t('album.title')}
        </Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: space.lg }}>
        <ReviewList filter={{ album: id }} header={header} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  topTitle: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '65%' },
  header: { flexDirection: 'row', gap: space.lg, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  cover: { width: 120, height: 120, borderRadius: 6, backgroundColor: colors.card },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  year: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs },
  average: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  outOf: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
});
