import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { TrendingTrack } from '../lib/types';
import { colors, fonts, radius, space, text } from '../theme';

/** Uma linha do ranking: posição, capa, música e quantos posts teve. */
export function TrendingRow({ item, onOpen, showRank = true }: { item: TrendingTrack; onOpen?: (url: string) => void; showRank?: boolean }) {
  const { t } = useTranslation();
  const platform = PLATFORM_LABELS[item.platform];
  const open = () => (onOpen ? onOpen(item.url) : Linking.openURL(item.url));
  return (
    <Pressable
      testID={`trending-${item.rank}`}
      accessibilityRole="link"
      accessibilityLabel={`${showRank ? `${item.rank}. ` : ''}${item.title}${item.artist ? `, ${item.artist}` : ''}. ${t('feed.listenOn', { platform })}`}
      onPress={open}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      {showRank ? <Text style={[styles.rank, item.rank <= 3 && { color: colors.primary }]}>{item.rank}</Text> : null}
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="musical-note" size={20} color={colors.muted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={text.small} numberOfLines={1}>
          {[item.artist, t('trending.posts', { count: item.post_count })].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="play-circle" size={28} color={colors.muted} />
    </Pressable>
  );
}

export function TrendingList({
  items,
  loading,
  refreshing,
  onRefresh,
  header,
}: {
  items: TrendingTrack[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  header: ReactElement;
}) {
  const { t } = useTranslation();
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.link_preview_id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <TrendingRow item={item} />}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
        ) : (
          <Text style={[text.body, { color: colors.textMuted, textAlign: 'center', marginTop: space.xl }]}>{t('trending.empty')}</Text>
        )
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rank: { width: 28, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, color: colors.textMuted },
  cover: { width: 52, height: 52, borderRadius: radius.sm },
  coverFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
