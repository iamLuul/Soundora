import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { postMediaUrls } from '../lib/api';
import type { PostMedia as Media } from '../lib/types';
import { colors, space } from '../theme';

/** URLs assinadas (1 h) de todas as mídias do post, numa chamada só. */
function useMediaUrls(media: Media[]) {
  const paths = media.map((m) => m.path);
  return useQuery({ queryKey: ['post-media', ...paths], queryFn: () => postMediaUrls(paths), enabled: paths.length > 0, staleTime: 50 * 60_000 });
}

/** Proporção da primeira mídia, entre 4:5 (em pé) e 16:9 (deitada), como no X/Instagram. */
function ratio(m: Media) {
  return Math.min(16 / 9, Math.max(4 / 5, m.width / m.height));
}

/** Fotos (1 a 4, em grade) ou um vídeo do post. */
export function PostMedia({ media }: { media: Media[] }) {
  const { t } = useTranslation();
  const urls = useMediaUrls(media);
  const [zoom, setZoom] = useState<string | null>(null);
  if (!media.length) return null;

  const first = media[0]!;
  if (first.kind === 'video') {
    const uri = urls.data?.[first.path];
    return <View style={[styles.box, { aspectRatio: ratio(first) }]}>{uri ? <PostVideo uri={uri} /> : <ActivityIndicator color={colors.muted} style={{ flex: 1 }} />}</View>;
  }

  const photo = (m: Media, style: object) => {
    const uri = urls.data?.[m.path];
    return (
      <Pressable key={m.path} accessibilityRole="imagebutton" accessibilityLabel={t('post.openPhoto')} onPress={() => uri && setZoom(uri)} style={[styles.cell, style]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
      </Pressable>
    );
  };

  return (
    <>
      {media.length === 1 ? (
        <View style={[styles.box, { aspectRatio: ratio(first) }]}>{photo(first, { flex: 1 })}</View>
      ) : (
        <View style={[styles.box, styles.grid, { aspectRatio: 16 / 10 }]}>
          <View style={styles.col}>
            {photo(media[0]!, { flex: 1 })}
            {media.length === 4 ? photo(media[2]!, { flex: 1 }) : null}
          </View>
          <View style={styles.col}>
            {photo(media[1]!, { flex: 1 })}
            {media.length === 3 ? photo(media[2]!, { flex: 1 }) : null}
            {media.length === 4 ? photo(media[3]!, { flex: 1 }) : null}
          </View>
        </View>
      )}
      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <View style={styles.zoom}>
          {zoom ? <Image source={{ uri: zoom }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setZoom(null)} style={styles.close} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** Vídeo do post: não toca sozinho; controles do sistema. */
function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  box: { width: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card },
  grid: { flexDirection: 'row', gap: 2 },
  col: { flex: 1, gap: 2 },
  cell: { overflow: 'hidden', backgroundColor: colors.card },
  zoom: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', top: space.xxl, right: space.lg },
});
