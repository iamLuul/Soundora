import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { signPostMedia } from '../lib/api';
import type { PostMedia as Media } from '../lib/types';
import { colors } from '../theme';
import { MediaViewer, type ViewerItem } from './MediaViewer';
import { Spinner } from './Spinner';

/** URLs assinadas (1 h) das mídias do post; os posts da mesma página assinam juntos (signPostMedia). */
function useMediaUrls(media: Media[]) {
  const paths = media.map((m) => m.path);
  return useQuery({ queryKey: ['post-media', ...paths], queryFn: () => signPostMedia(paths), enabled: paths.length > 0, staleTime: 50 * 60_000 });
}

/** Proporção da primeira mídia, entre 4:5 (em pé) e 16:9 (deitada), como no X/Instagram. */
function ratio(m: Media) {
  return Math.min(16 / 9, Math.max(4 / 5, m.width / m.height));
}

/** Fotos (1 a 4, em grade) ou um vídeo do post. */
export function PostMedia({ media }: { media: Media[] }) {
  const { t } = useTranslation();
  const urls = useMediaUrls(media);
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;

  const first = media[0]!;
  if (first.kind === 'video') {
    const uri = urls.data?.[first.path];
    return <View style={[styles.box, { aspectRatio: ratio(first) }]}>{uri ? <PostVideo uri={uri} /> : <Spinner color={colors.muted} style={{ flex: 1 }} />}</View>;
  }

  // Tudo o que já tem URL, na ordem do post, para passar de uma em uma em tela cheia.
  const viewerItems: ViewerItem[] = media.flatMap((m) => {
    const uri = urls.data?.[m.path];
    return uri ? [{ key: m.path, kind: m.kind, uri }] : [];
  });

  const photo = (m: Media, style: object) => {
    const uri = urls.data?.[m.path];
    const at = viewerItems.findIndex((v) => v.key === m.path);
    return (
      <Pressable
        key={m.path}
        testID={`post-photo-${media.indexOf(m)}`}
        accessibilityRole="imagebutton"
        accessibilityLabel={t('post.openPhoto')}
        onPress={() => at >= 0 && setOpen(at)}
        style={[styles.cell, style]}
      >
        {/* cacheKey = o arquivo (a URL assinada muda a cada hora; a foto não precisa baixar de novo). */}
        {uri ? <Image source={{ uri, cacheKey: m.path }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" /> : null}
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
      <MediaViewer items={viewerItems} index={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Vídeo do post: não toca sozinho; controles do sistema. */
/**
 * Vídeo do post: só cria o player (e começa a baixar) quando a pessoa toca. Antes, cada vídeo
 * do feed abria um player e baixava sozinho, mesmo sem ninguém assistir.
 */
function PostVideo({ uri }: { uri: string }) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  if (!started) {
    return (
      <Pressable testID="post-video-play" accessibilityRole="button" accessibilityLabel={t('post.playVideo')} onPress={() => setStarted(true)} style={styles.videoCover}>
        <Ionicons name="play-circle" size={56} color={colors.text} />
      </Pressable>
    );
  }
  return <PlayingVideo uri={uri} />;
}

function PlayingVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  box: { width: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card },
  grid: { flexDirection: 'row', gap: 2 },
  col: { flex: 1, gap: 2 },
  cell: { overflow: 'hidden', backgroundColor: colors.card },
  videoCover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
});
