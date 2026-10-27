import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORM_LABELS, type Platform } from '@soundhora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Platform as RNPlatform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts, radius, space } from '../theme';
import { PLATFORM_GRADIENT, PlatformLogo } from './figma';
import { Reactive } from './Reactive';

export interface MusicCardData {
  url: string;
  platform: Platform;
  title: string;
  artist: string | null;
  imageUrl: string | null;
}

/**
 * Cartão de prévia de uma música, no layout do Figma ("Sharing"): capa com o play,
 * título, artista e o logo da plataforma, num degradê com as cores da plataforma, com o brilho
 * de vidro na borda. Reage ao toque (encolhe) e, na web, ao mouse (sobe um pouco).
 * O Soundhora não toca áudio: tocar abre a faixa no streaming de origem.
 */
export function MusicCard({ data, onOpen }: { data: MusicCardData; onOpen?: (url: string) => void }) {
  const { t } = useTranslation();
  const platform = PLATFORM_LABELS[data.platform];
  const [from, to] = PLATFORM_GRADIENT[data.platform];
  const open = () => (onOpen ? onOpen(data.url) : Linking.openURL(data.url));

  return (
    <Reactive
      accessibilityRole="link"
      accessibilityLabel={`${data.title}${data.artist ? `, ${data.artist}` : ''}. ${t('feed.listenOn', { platform })}`}
      onPress={open}
      pressScale={0.98}
      hoverScale={1.01}
      style={({ hovered }) => [
        styles.card,
        { backgroundColor: from, backgroundImage: `linear-gradient(110deg, ${from} 0%, ${to} 100%)` },
        hovered && styles.hovered,
      ]}
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
    </Reactive>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    boxShadow: '0 8px 22px rgba(10, 6, 30, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
  },
  hovered: RNPlatform.select<ViewStyle>({ web: { boxShadow: '0 14px 30px rgba(10, 6, 30, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.3)' }, default: {} })!,
  cover: { width: 62, height: 62, borderRadius: radius.sm },
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
  chip: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  chipText: { fontFamily: fonts.bold, fontSize: 9, color: '#464B54' },
  logo: { alignSelf: 'flex-start' },
});
