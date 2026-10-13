import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TopAlbum } from '../lib/api';
import { formatRating } from '../lib/reviews';
import { colors, fonts, space, text } from '../theme';
import { PullToRefresh } from './PullToRefresh';
import { TrackListSkeleton } from './Skeleton';
import { ErrorState } from './ErrorState';

/** Uma linha do Top Reviews: posição, capa, álbum, artista e ano, e a média ao lado. */
export function TopAlbumRow({ item, onPress }: { item: TopAlbum; onPress: (item: TopAlbum) => void }) {
  const { t, i18n } = useTranslation();
  const average = formatRating(item.average, i18n.language);
  return (
    <Pressable
      testID={`top-album-${item.rank}`}
      accessibilityRole="link"
      accessibilityLabel={t('trending.rowReviewLabel', { rank: item.rank, title: item.title, artist: item.artist ?? '', average, count: item.review_count })}
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.rank}>{item.rank}</Text>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="disc-outline" size={24} color={colors.muted} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {[item.artist, item.year].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.count}>{t('trending.reviewCount', { count: item.review_count })}</Text>
      </View>
      <View style={styles.score}>
        <Ionicons name="star" size={15} color={colors.text} />
        <Text testID={`top-album-average-${item.rank}`} style={styles.average}>
          {average}
        </Text>
      </View>
    </Pressable>
  );
}

export function TopAlbumList({
  items,
  loading,
  error,
  failed = false,
  onRefresh,
  onPress,
  header,
}: {
  items: TopAlbum[];
  loading: boolean;
  error: string | null;
  /** O carregamento falhou: `error` é o motivo e aparece o "Tentar de novo". */
  failed?: boolean;
  onRefresh: () => unknown;
  onPress: (item: TopAlbum) => void;
  header: ReactElement;
}) {
  return (
    <PullToRefresh onRefresh={onRefresh}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.album_id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <TopAlbumRow item={item} onPress={onPress} />}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          loading ? (
            <TrackListSkeleton count={8} rank />
          ) : failed ? (
            <ErrorState message={error ?? ''} onRetry={onRefresh} />
          ) : (
            <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl }]}>{error}</Text>
          )
        }
      />
    </PullToRefresh>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rank: { width: 26, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  cover: { width: 56, height: 56, borderRadius: 6 },
  coverFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  score: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 54, justifyContent: 'flex-end' },
  average: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
});
