import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS, type Platform } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space, text } from '../theme';

export interface MusicCardData {
  url: string;
  platform: Platform;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

/**
 * Cartão de prévia de uma música. O Soundora não toca áudio: o botão abre a
 * faixa no streaming de origem do link (o app, se instalado; senão o site).
 */
export function MusicCard({ data, onOpen }: { data: MusicCardData; onOpen?: (url: string) => void }) {
  const { t } = useTranslation();
  const platform = PLATFORM_LABELS[data.platform];
  const open = () => (onOpen ? onOpen(data.url) : Linking.openURL(data.url));

  return (
    <View style={styles.card}>
      {data.imageUrl ? (
        <Image source={{ uri: data.imageUrl }} style={styles.cover} contentFit="cover" accessibilityLabel={data.title} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="musical-notes" size={28} color={colors.muted} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={text.subtitle} numberOfLines={2}>
          {data.title}
        </Text>
        {data.artist ? (
          <Text style={text.small} numberOfLines={1}>
            {data.artist}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('feed.listenOn', { platform })}
          onPress={open}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="play" size={14} color={colors.text} />
          <Text style={styles.playText}>{t('feed.listenOn', { platform })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  cover: { width: 88, height: 88, borderRadius: radius.md },
  coverFallback: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: space.xs, justifyContent: 'center' },
  play: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  playText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
});
