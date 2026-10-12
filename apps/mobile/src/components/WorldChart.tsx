import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { ChartTrack } from '../lib/api';
import { colors, fonts, space, text } from '../theme';
import { TrackListSkeleton } from './Skeleton';

/** Cores do Figma (Trending Page): selo NEW amarelo, seta verde (subiu) e vermelha (caiu). */
const MOVE = { up: '#4E9A51', down: '#C44545', new: '#FFD43B' };

function MoveBadge({ move, previous }: { move: ChartTrack['move']; previous: number | null }) {
  const { t } = useTranslation();
  if (move === 'new')
    return (
      <View style={styles.newBadge} accessibilityLabel={t('trending.moveNew')}>
        <Text style={styles.newText}>NEW</Text>
      </View>
    );
  if (move === 'up' || move === 'down')
    return (
      <View
        style={[styles.arrow, { backgroundColor: MOVE[move] }]}
        accessibilityLabel={t(move === 'up' ? 'trending.moveUp' : 'trending.moveDown', { position: previous })}
      >
        <Ionicons name={move === 'up' ? 'arrow-up' : 'arrow-down'} size={16} color="#FFFFFF" />
      </View>
    );
  if (move === 'same')
    return (
      <View style={[styles.arrow, { backgroundColor: colors.surface }]} accessibilityLabel={t('trending.moveSame')}>
        <Ionicons name="remove" size={16} color="#FFFFFF" />
      </View>
    );
  return <View style={styles.arrowSpace} />;
}

/** Uma linha do ranking: posição, capa, música, artista, álbum e se subiu/caiu. */
export function ChartRow({ item, onPress, opening }: { item: ChartTrack; onPress: (item: ChartTrack) => void; opening?: boolean }) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={`chart-${item.position}`}
      accessibilityRole="link"
      accessibilityLabel={t('trending.rowLabel', { position: item.position, title: item.title, artist: item.artist })}
      onPress={() => onPress(item)}
      disabled={opening}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.rank}>{item.position}</Text>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="musical-note" size={22} color={colors.muted} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {item.artist}
        </Text>
        {item.album ? (
          <Text style={styles.album} numberOfLines={1}>
            {item.album}
          </Text>
        ) : null}
      </View>
      {opening ? <ActivityIndicator color={colors.primary} style={styles.arrowSpace} /> : <MoveBadge move={item.move} previous={item.previous_position} />}
    </Pressable>
  );
}

export function WorldChartList({
  items,
  loading,
  error,
  refreshing,
  onRefresh,
  onPress,
  openingKey,
  header,
}: {
  items: ChartTrack[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onPress: (item: ChartTrack) => void;
  openingKey: string | null;
  header: ReactElement;
}) {
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.key}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ChartRow item={item} onPress={onPress} opening={openingKey === item.key} />}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ListEmptyComponent={
        loading ? (
          <TrackListSkeleton count={8} rank />
        ) : (
          <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl }]}>{error}</Text>
        )
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rank: { width: 26, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  cover: { width: 56, height: 56, borderRadius: 10 },
  coverFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  album: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  arrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  arrowSpace: { width: 28, height: 28 },
  newBadge: { backgroundColor: MOVE.new, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  newText: { fontFamily: fonts.bold, fontSize: 10, color: '#1F1D2B' },
});
