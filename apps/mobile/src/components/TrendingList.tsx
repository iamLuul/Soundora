import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORM_LABELS } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrendingTrack } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { PlatformLogo } from './figma';

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
      {showRank ? <Text style={styles.rank}>{item.rank}</Text> : null}
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
        <Text style={styles.artist} numberOfLines={1}>
          {[item.artist, t('trending.posts', { count: item.post_count })].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <PlatformLogo platform={item.platform} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rank: { width: 22, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  cover: { width: 52, height: 52, borderRadius: 10 },
  artist: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  coverFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
});
