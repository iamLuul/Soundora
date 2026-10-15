import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORM_LABELS, type StreamingChoice } from '@soundhora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackItem } from '../lib/api';
import { colors, fonts, space } from '../theme';
import { PlatformLogo } from './figma';

/**
 * Linha de música (Figma: Music page/Playlists e Trending): capa, título, artista e o logo
 * da plataforma onde ela abre. Com `platform` (a escolhida pela pessoa), mostra essa e
 * `onPress` abre nela; sem, abre o link de origem.
 */
export function TrackRow({
  item,
  leading,
  trailing,
  testID,
  platform: chosen,
  onPress,
}: {
  item: TrackItem;
  leading?: ReactNode;
  trailing?: ReactNode;
  testID?: string;
  platform?: StreamingChoice | null;
  onPress?: (item: TrackItem) => void;
}) {
  const { t } = useTranslation();
  const target = chosen ?? item.platform;
  const platform = PLATFORM_LABELS[target];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={`${item.title}${item.artist ? `, ${item.artist}` : ''}. ${t('feed.listenOn', { platform })}`}
      onPress={() => (onPress ? onPress(item) : Linking.openURL(item.url))}
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
      {trailing ?? <PlatformLogo platform={target} size={20} />}
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
