import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LikedSong } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { webTouch } from '../lib/touch';

/** Figma: estrela verde-clara das músicas curtidas. */
export const STAR = '#B7FF95';

/**
 * Figma: "Liked songs" — capa, título, artista e álbum. Tocar abre na plataforma da pessoa;
 * a estrela (só nas minhas) descurte.
 */
export function LikedSongRow({ song, onOpen, onUnlike }: { song: LikedSong; onOpen: (s: LikedSong) => void; onUnlike?: (s: LikedSong) => void }) {
  const { t } = useTranslation();
  const s = song;
  return (
    <View style={styles.row}>
      <Pressable
        testID={`liked-${s.link_preview_id}`}
        accessibilityRole="link"
        accessibilityLabel={t('trending.rowLabel', { position: '', title: s.title, artist: s.artist ?? '' })}
        onPress={() => onOpen(s)}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.8 }]}
      >
        {s.image_url ? (
          <Image source={{ uri: s.image_url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="musical-note" size={20} color={colors.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {s.title}
          </Text>
          {s.artist ? (
            <Text style={styles.artist} numberOfLines={1}>
              {s.artist}
            </Text>
          ) : null}
          {s.album ? (
            <Text style={styles.album} numberOfLines={1}>
              {s.album}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {onUnlike ? (
        <Pressable testID={`unlike-${s.link_preview_id}`} accessibilityRole="button" accessibilityLabel={t('discover.unlike')} onPress={() => onUnlike(s)} hitSlop={10} style={webTouch(10)}>
          <Ionicons name="star" size={26} color={STAR} />
        </Pressable>
      ) : (
        <Ionicons name="star" size={22} color={STAR} accessibilityElementsHidden importantForAccessibility="no" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  cover: { width: 56, height: 56, borderRadius: 4 },
  coverFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  album: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
});
