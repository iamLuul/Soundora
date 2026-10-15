import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORM_LABELS, type Platform } from '@soundhora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '../theme';
import { PLATFORM_ACCENT, PlatformLogo } from './figma';

export interface MusicCardData {
  url: string;
  platform: Platform;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

/**
 * Cartão de prévia de uma música, no layout do Figma ("Sharing"): capa com o play,
 * título, artista e o logo da plataforma, numa caixa com a cor da plataforma.
 * O Soundhora não toca áudio: tocar abre a faixa no streaming de origem.
 */
export function MusicCard({ data, onOpen }: { data: MusicCardData; onOpen?: (url: string) => void }) {
  const { t } = useTranslation();
  const platform = PLATFORM_LABELS[data.platform];
  const accent = PLATFORM_ACCENT[data.platform];
  const open = () => (onOpen ? onOpen(data.url) : Linking.openURL(data.url));

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${data.title}${data.artist ? `, ${data.artist}` : ''}. ${t('feed.listenOn', { platform })}`}
      onPress={open}
      style={({ pressed }) => [styles.card, { borderColor: accent, backgroundColor: `${accent}1A` }, pressed && { opacity: 0.85 }]}
    >
      <View>
        {data.imageUrl ? (
          <Image source={{ uri: data.imageUrl }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="musical-notes" size={24} color={colors.muted} />
          </View>
        )}
        <View style={styles.playOverlay} pointerEvents="none">
          <Ionicons name="play" size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {data.title}
        </Text>
        {data.artist ? (
          <Text style={styles.artist} numberOfLines={1}>
            {data.artist}
          </Text>
        ) : null}
        <View style={styles.chip}>
          <Text style={styles.chipText}>{t('feed.listenOn', { platform })}</Text>
        </View>
      </View>
      <View style={styles.logo}>
        <PlatformLogo platform={data.platform} size={20} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, padding: 10, borderRadius: 10, borderWidth: 0.5 },
  cover: { width: 62, height: 62, borderRadius: 5 },
  coverFallback: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  playOverlay: {
    position: 'absolute',
    left: 15,
    top: 15,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(48, 45, 63, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, justifyContent: 'center', gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  chip: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#FFFFFF', borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1 },
  chipText: { fontFamily: fonts.bold, fontSize: 9, color: '#464B54' },
  logo: { alignSelf: 'flex-start' },
});
