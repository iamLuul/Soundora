import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEvent } from 'expo';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { signPostMedia } from '../lib/api';
import type { PostMedia as Media } from '../lib/types';
import { display } from '../lib/display';
import { formatClock, useFeedMuted, usePostVisible } from '../lib/feed-video';
import { colors, fonts, gradients } from '../theme';
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
export function PostMedia({ media, postId }: { media: Media[]; postId?: string }) {
  const { t } = useTranslation();
  const urls = useMediaUrls(media);
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;

  const first = media[0]!;
  if (first.kind === 'video') {
    const uri = urls.data?.[first.path];
    return (
      <View style={[styles.box, { aspectRatio: ratio(first) }]}>
        {uri ? <PostVideo uri={uri} postId={postId} /> : <Spinner color={colors.muted} style={{ flex: 1 }} />}
      </View>
    );
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
        {uri ? (
          <Image source={{ uri, cacheKey: m.path }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
        ) : null}
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

/** O app está aberto na frente (em segundo plano o vídeo para). */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Vídeo do post, com o player do Soundhora: toca sozinho, sem som e em loop, enquanto o post está
 * na tela (e a tela aberta, e o app na frente). O alto-falante no canto liga e desliga o som ali
 * mesmo; tocar no vídeo pausa e continua. Só baixa quando aparece na tela pela primeira vez.
 * Com "reduzir movimento" ligado, não toca sozinho: espera a pessoa tocar no play.
 */
function PostVideo({ uri, postId }: { uri: string; postId?: string }) {
  const { t } = useTranslation();
  const onScreen = usePostVisible(postId);
  const focused = useIsFocused();
  const appActive = useAppActive();
  const visible = onScreen && focused && appActive;
  // Já apareceu uma vez (ou a pessoa tocou no play): o player existe daí em diante.
  const [started, setStarted] = useState(false);
  const autoplay = !display.reduceMotion;
  if (!started && visible && autoplay) setStarted(true);
  if (!started) {
    return (
      <Pressable
        testID="post-video-play"
        accessibilityRole="button"
        accessibilityLabel={t('post.playVideo')}
        onPress={() => setStarted(true)}
        style={styles.videoCover}
      >
        <View style={styles.bigPlay}>
          <Ionicons name="play" size={30} color={colors.text} style={{ marginLeft: 3 }} />
        </View>
      </Pressable>
    );
  }
  return <PlayingVideo uri={uri} visible={visible} />;
}

function PlayingVideo({ uri, visible }: { uri: string; visible: boolean }) {
  const { t } = useTranslation();
  const [muted, setMuted] = useFeedMuted();
  // Pausado pela pessoa: não volta a tocar sozinho até ela tocar de novo.
  const [userPaused, setUserPaused] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
    // Sem som, não interrompe a música que a pessoa ouve em outro app.
    p.audioMixingMode = 'mixWithOthers';
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });

  const shouldPlay = visible && !userPaused;
  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, shouldPlay]);
  useEffect(() => applySound(player, muted), [player, muted]);

  const duration = player.duration || 0;
  const progress = duration > 0 ? Math.min(1, time.currentTime / duration) : 0;
  const loading = status === 'loading' || (status === 'idle' && shouldPlay && !isPlaying);

  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {/* Tocar no vídeo: pausa ou continua (sem abrir o post). */}
      <Pressable
        testID="post-video-toggle"
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t('post.pauseVideo') : t('post.playVideo')}
        onPress={() => setUserPaused(isPlaying)}
        style={StyleSheet.absoluteFill}
      >
        {!isPlaying && !loading ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.center}>
            <View style={styles.bigPlay}>
              <Ionicons name="play" size={30} color={colors.text} style={{ marginLeft: 3 }} />
            </View>
          </Animated.View>
        ) : null}
        {loading ? (
          <View style={styles.center}>
            <Spinner color={colors.text} />
          </View>
        ) : null}
      </Pressable>
      {duration > 0 ? (
        <View style={styles.clock} pointerEvents="none">
          <Text style={styles.clockText}>{formatClock(duration - time.currentTime)}</Text>
        </View>
      ) : null}
      <Pressable
        testID="post-video-mute"
        accessibilityRole="button"
        accessibilityLabel={muted ? t('post.unmute') : t('post.mute')}
        accessibilityState={{ checked: !muted }}
        onPress={() => setMuted(!muted)}
        hitSlop={10}
        style={({ pressed }) => [styles.speaker, pressed && { transform: [{ scale: 0.9 }] }]}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color={colors.text} />
      </Pressable>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </>
  );
}

/** Com som, pausa a música de outro app enquanto o vídeo fala; mudo, deixa tocar junto. */
function applySound(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
  player.audioMixingMode = muted ? 'mixWithOthers' : 'doNotMix';
}

const GLASS_DARK = Platform.select({
  web: { backgroundColor: 'rgba(30, 27, 46, 0.55)', backdropFilter: 'blur(10px)' } as object,
  default: { backgroundColor: 'rgba(30, 27, 46, 0.6)' },
});

const styles = StyleSheet.create({
  box: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card },
  grid: { flexDirection: 'row', gap: 2 },
  col: { flex: 1, gap: 2 },
  cell: { overflow: 'hidden', backgroundColor: colors.card },
  videoCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    backgroundImage: 'linear-gradient(135deg, rgba(104, 94, 255, 0.35) 0%, rgba(50, 47, 66, 1) 70%)',
  },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Botões do player: vidro escuro com a borda clara do Soundhora (legível sobre qualquer imagem).
  bigPlay: {
    width: 60,
    height: 60,
    borderRadius: 30,
    ...GLASS_DARK,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speaker: {
    position: 'absolute',
    right: 10,
    bottom: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    ...GLASS_DARK,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: {
    position: 'absolute',
    left: 10,
    bottom: 12,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    ...GLASS_DARK,
    justifyContent: 'center',
  },
  clockText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'] },
  // Barra de progresso fininha no pé do vídeo, com o degradê roxo.
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  fill: { height: 3, backgroundColor: colors.primary, backgroundImage: gradients.primary },
});
