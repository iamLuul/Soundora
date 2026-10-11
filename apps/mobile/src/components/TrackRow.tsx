import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackItem } from '../lib/api';
import { colors, fonts, space } from '../theme';
import { PlatformLogo } from './figma';

/** Linha de música (Figma: Music page/Playlists e Trending): capa, título, artista. */
export function TrackRow({ item, leading, trailing, testID }: { item: TrackItem; leading?: ReactNode; trailing?: ReactNode; testID?: string }) {
  const { t } = useTranslation();
  const platform = PLATFORM_LABELS[item.platform];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${item.title}${item.artist ? `, ${item.artist}` : ''}. ${t('feed.listenOn', { platform })}`}
      onPress={() => Linking.openURL(item.url)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      {leading}
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.fallback]}>
          <Ionicons name="musical-note" size={20} color={colors.muted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        {item.artist ? (
          <Text style={styles.artist} numberOfLines={1}>
            {item.artist}
          </Text>
        ) : null}
      </View>
      {trailing ?? <PlatformLogo platform={item.platform} size={20} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  cover: { width: 52, height: 52, borderRadius: 10 },
  fallback: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
});
