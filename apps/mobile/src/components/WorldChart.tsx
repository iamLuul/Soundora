import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChartTrack } from '../lib/api';
import { colors, fonts, space, text } from '../theme';
import { TrackListSkeleton } from './Skeleton';
import { PullToRefresh } from './PullToRefresh';
import { Spinner } from './Spinner';
import { ErrorState } from './ErrorState';
import { useTabBarInset } from './TabBar';

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
export function ChartRow({
  item,
  onPress,
  opening,
  compact = false,
}: {
  item: ChartTrack;
  onPress: (item: ChartTrack) => void;
  opening?: boolean;
  /** Menor, para a coluna da direita do desktop (Figma: Most Listened Songs). */
  compact?: boolean;
}) {
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
      <Text style={[styles.rank, compact && styles.rankCompact]}>{item.position}</Text>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={[styles.cover, compact && styles.coverCompact]} contentFit="cover" />
      ) : (
        <View style={[styles.cover, compact && styles.coverCompact, styles.coverFallback]}>
          <Ionicons name="musical-note" size={22} color={colors.muted} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
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
      {opening ? <Spinner size={20} style={styles.arrowSpace} /> : <MoveBadge move={item.move} previous={item.previous_position} />}
    </Pressable>
  );
}

export function WorldChartList({
  items,
  loading,
  error,
  failed = false,
  onRefresh,
  onPress,
  openingKey,
  header,
}: {
  items: ChartTrack[];
  loading: boolean;
  error: string | null;
  /** O carregamento falhou: `error` é o motivo e aparece o "Tentar de novo". */
  failed?: boolean;
  onRefresh: () => unknown;
  onPress: (item: ChartTrack) => void;
  openingKey: string | null;
  header: ReactElement;
}) {
  const tabInset = useTabBarInset();
  return (
    <PullToRefresh onRefresh={onRefresh}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ChartRow item={item} onPress={onPress} opening={openingKey === item.key} />}
        // A lista vai até a beirada da coluna (a barra de rolagem do computador fica no vão entre os
        // ícones e a linha lateral); o conteúdo continua no mesmo lugar.
        style={{ marginRight: -space.md }}
        contentContainerStyle={{ paddingBottom: space.xxl + tabInset, paddingRight: space.md }}
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
  cover: { width: 56, height: 56, borderRadius: 10 },
  coverCompact: { width: 42, height: 42, borderRadius: 6 },
  rankCompact: { width: 18, fontSize: 14 },
  titleCompact: { fontSize: 13 },
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
