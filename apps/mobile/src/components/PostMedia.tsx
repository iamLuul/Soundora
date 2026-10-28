import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEvent } from 'expo';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { signPostMedia } from '../lib/api';
import type { PostMedia as Media } from '../lib/types';
import { display } from '../lib/display';
import { formatClock, useFeedMuted, usePostVisible } from '../lib/feed-video';
import { colors, fonts, gradients } from '../theme';
import { MediaViewer, type ViewerItem } from './MediaViewer';
import { lockSwipe, swallowNextClick } from './SwipeTabs';
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
  // Controles (play/pause, avançar/voltar, linha do tempo, tela cheia): aparecem ao tocar no vídeo.
  const [controls, setControls] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Arrastando a linha do tempo: a posição que o dedo mostra (segundos).
  const [scrub, setScrub] = useState<number | null>(null);
  const videoRef = useRef<VideoView>(null);
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

  // Em tela cheia continua tocando mesmo que o post saia da lista.
  const shouldPlay = (visible || fullscreen) && !userPaused;
  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, shouldPlay]);
  useEffect(() => applySound(player, muted), [player, muted]);

  // Controles somem sozinhos depois de 3 s tocando (parado ou arrastando, ficam).
  useEffect(() => {
    if (!controls || !isPlaying || scrub !== null) return;
    const id = setTimeout(() => setControls(false), 3000);
    return () => clearTimeout(id);
  }, [controls, isPlaying, scrub, time.currentTime]);

  const duration = player.duration || 0;
  const now = scrub ?? time.currentTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, now / duration)) : 0;
  const loading = status === 'loading' || (status === 'idle' && shouldPlay && !isPlaying);
  const togglePlay = () => setUserPaused(isPlaying);
  const skip = (delta: number) => seekTo(player, Math.min(Math.max(0, time.currentTime + delta), Math.max(0, duration - 0.1)));

  return (
    <>
      <VideoView
        ref={videoRef}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Em tela cheia, os controles do sistema; na timeline, os do Soundhora.
        nativeControls={fullscreen}
        onFullscreenEnter={() => setFullscreen(true)}
        onFullscreenExit={() => setFullscreen(false)}
      />
      {/* Tocar no vídeo: mostra ou esconde os controles (sem abrir o post). */}
      <Pressable
        testID="post-video-toggle"
        accessibilityRole="button"
        accessibilityLabel={controls ? t('post.hideControls') : t('post.showControls')}
        onPress={() => setControls((v) => !v)}
        style={[StyleSheet.absoluteFill, controls && styles.dim]}
      />

      {loading ? (
        <View style={styles.center} pointerEvents="none">
          <Spinner color={colors.text} />
        </View>
      ) : controls || !isPlaying ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.center} pointerEvents="box-none">
          <View style={styles.centerRow} pointerEvents="box-none">
            {controls ? <RoundButton testID="post-video-back" label={t('post.back10')} icon="play-back" size={44} onPress={() => skip(-10)} /> : null}
            <RoundButton
              testID="post-video-play-pause"
              label={isPlaying ? t('post.pauseVideo') : t('post.playVideo')}
              icon={isPlaying ? 'pause' : 'play'}
              size={60}
              onPress={togglePlay}
            />
            {controls ? <RoundButton testID="post-video-forward" label={t('post.forward10')} icon="play-forward" size={44} onPress={() => skip(10)} /> : null}
          </View>
        </Animated.View>
      ) : null}

      {controls && duration > 0 ? (
        // A linha do tempo sobe do pé do vídeo: arraste (ou toque) para voltar e avançar.
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(150)} style={styles.bar}>
          <Scrubber
            progress={progress}
            duration={duration}
            label={t('post.seek')}
            onScrub={(sec) => setScrub(sec)}
            onSeek={(sec) => {
              seekTo(player, sec);
              setScrub(null);
            }}
          />
          <View style={styles.barRow}>
            <Text style={styles.barTime}>
              {formatClock(now)} / {formatClock(duration)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SpeakerButton muted={muted} onToggle={() => setMuted(!muted)} inline />
              <RoundButton
                testID="post-video-fullscreen"
                label={t('post.fullscreen')}
                icon="expand"
                size={32}
                iconSize={16}
                onPress={() => void videoRef.current?.enterFullscreen()}
              />
            </View>
          </View>
        </Animated.View>
      ) : (
        <>
          {duration > 0 ? (
            <View style={styles.clock} pointerEvents="none">
              <Text style={styles.clockText}>{formatClock(duration - time.currentTime)}</Text>
            </View>
          ) : null}
          <SpeakerButton muted={muted} onToggle={() => setMuted(!muted)} />
          <View style={styles.track} pointerEvents="none">
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        </>
      )}
    </>
  );
}

/** Botão redondo de vidro escuro do player. */
function RoundButton({
  testID,
  label,
  icon,
  size,
  iconSize,
  onPress,
}: {
  testID: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  size: number;
  iconSize?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.round, { width: size, height: size, borderRadius: size / 2 }, pressed && { transform: [{ scale: 0.9 }] }]}
    >
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.45)} color={colors.text} style={icon === 'play' ? { marginLeft: 3 } : undefined} />
    </Pressable>
  );
}

/** Alto-falante: liga e desliga o som (vale para todos os vídeos da timeline). */
function SpeakerButton({ muted, onToggle, inline = false }: { muted: boolean; onToggle: () => void; inline?: boolean }) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID="post-video-mute"
      accessibilityRole="button"
      accessibilityLabel={muted ? t('post.unmute') : t('post.mute')}
      accessibilityState={{ checked: !muted }}
      onPress={onToggle}
      hitSlop={10}
      style={({ pressed }) => [styles.round, styles.speakerSize, !inline && styles.speaker, pressed && { transform: [{ scale: 0.9 }] }]}
    >
      <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color={colors.text} />
    </Pressable>
  );
}

/**
 * Linha do tempo arrastável: o dedo (ou o mouse) mostra a posição enquanto arrasta e o vídeo
 * pula para lá ao soltar; tocar num ponto também pula. Leitor de tela: ajustável (±5 s).
 */
function Scrubber({
  progress,
  duration,
  label,
  onScrub,
  onSeek,
}: {
  progress: number;
  duration: number;
  label: string;
  onScrub: (sec: number) => void;
  onSeek: (sec: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const at = (x: number) => (width > 0 ? Math.min(1, Math.max(0, x / width)) * duration : 0);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      // Arrastar a linha do tempo não troca de aba nem abre as Mensagens.
      lockSwipe(true);
      onScrub(at(e.x));
    })
    .onUpdate((e) => onScrub(at(e.x)))
    .onEnd((e) => onSeek(at(e.x)))
    .onFinalize((_e, success) => {
      lockSwipe(false);
      // Web: soltar o mouse vira um clique no post (que abriria ele): esse clique é ignorado.
      if (Platform.OS === 'web') swallowNextClick();
      if (!success) onSeek(progress * duration);
    });
  return (
    <GestureDetector gesture={pan}>
      <View
        testID="post-video-seek"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(progress * duration), text: formatClock(progress * duration) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onSeek(Math.min(duration, Math.max(0, progress * duration + (e.nativeEvent.actionName === 'increment' ? 5 : -5))))}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.scrubHit}
      >
        <View style={styles.scrubTrack}>
          <View style={[styles.fill, styles.scrubFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: Math.max(0, progress * width - 7) }]} />
      </View>
    </GestureDetector>
  );
}

/** Pula para um ponto do vídeo (segundos). */
function seekTo(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
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
  round: { ...GLASS_DARK, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.22)', alignItems: 'center', justifyContent: 'center' },
  speakerSize: { width: 32, height: 32, borderRadius: 16 },
  speaker: { position: 'absolute', right: 10, bottom: 12 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  // Véu escuro sobre o vídeo enquanto os controles aparecem (texto e botões legíveis).
  dim: { backgroundColor: 'rgba(15, 12, 30, 0.35)' },
  // Faixa de baixo com a linha do tempo, sobre um degradê escuro.
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 6,
    backgroundImage: 'linear-gradient(180deg, rgba(15, 12, 30, 0) 0%, rgba(15, 12, 30, 0.75) 100%)',
  },
  barRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTime: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text, fontVariant: ['tabular-nums'] },
  scrubHit: { height: 24, justifyContent: 'center' },
  scrubTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.25)', overflow: 'hidden' },
  scrubFill: { height: 4 },
  thumb: {
    position: 'absolute',
    top: 5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 0 3px rgba(104, 94, 255, 0.55)',
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
