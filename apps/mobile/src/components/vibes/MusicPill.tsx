import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '../../theme';
import type { VibeMusic } from './VibeContent';

/**
 * A música da vibe num selo no topo, como a música do Story: capa, "artista · música".
 * Ao criar, o X tira a música e tocar no selo troca; ao ver, tocar abre a música na plataforma.
 */
export function MusicPill({ music, onPress, onRemove, testID = 'vibe-music-pill' }: { music: VibeMusic; onPress?: () => void; onRemove?: () => void; testID?: string }) {
  const { t } = useTranslation();
  const label = [music.artist, music.title].filter(Boolean).join(' · ');
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        testID={testID}
        accessibilityRole={onPress ? 'button' : 'link'}
        accessibilityLabel={t('vibes.musicOf', { music: label })}
        onPress={onPress ?? (() => void Linking.openURL(music.url))}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}
      >
        {music.imageUrl ? <Image source={{ uri: music.imageUrl }} style={styles.cover} contentFit="cover" /> : <View style={[styles.cover, styles.coverEmpty]} />}
        <Ionicons name="musical-notes" size={13} color={colors.text} />
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
        {onRemove ? (
          <Pressable testID={`${testID}-remove`} accessibilityRole="button" accessibilityLabel={t('vibes.removeMusic')} onPress={onRemove} hitSlop={10} style={styles.remove}>
            <Ionicons name="close" size={12} color={colors.background} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 280,
    paddingLeft: 5,
    paddingRight: space.md,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(20,18,30,0.55)',
  },
  cover: { width: 30, height: 30, borderRadius: 6 },
  coverEmpty: { backgroundColor: colors.surface },
  text: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  remove: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
});
