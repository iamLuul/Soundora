import { useTranslation } from 'react-i18next';
import { PLATFORM_LABELS, type StreamingChoice } from '@soundora/core';
import * as Linking from 'expo-linking';
import { Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, SvgXml } from 'react-native-svg';
import { icons } from '../assets/icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { DiscoverCard } from '../lib/types';
import { colors, fonts, radius, space } from '../theme';
import { DiscoverCardView } from './DiscoverCardView';
import { Icon } from './figma';

const SWIPE_THRESHOLD = 0.3; // fração da largura da tela

/**
 * Pilha de cartões do Descobrir. Arrastar para a direita = curti; para a
 * esquerda = pular. Os botões fazem o mesmo, para quem não usa gestos
 * (e para leitores de tela).
 */
export function DiscoverDeck({
  cards,
  genreName,
  onSwipe,
  onShuffle,
  onOpen,
  platform,
  playing = false,
  progress = 0,
  seconds = null,
  onTogglePlay,
  height,
}: {
  cards: DiscoverCard[];
  genreName: (slug: string | null) => string | null;
  onSwipe: (card: DiscoverCard, liked: boolean) => void;
  /** Botão da esquerda (Figma): busca outras sugestões. */
  onShuffle?: () => void;
  /** Abrir a música na plataforma da pessoa (capa, logo, ou play sem prévia). */
  onOpen?: (card: DiscoverCard) => void;
  platform?: StreamingChoice | null;
  /** A prévia de 30 s do cartão de cima está tocando. */
  playing?: boolean;
  /** Quanto da prévia já tocou (0 a 1): o anel em volta do play. */
  progress?: number;
  /** Segundos já tocados e total da prévia (para o leitor de tela). */
  seconds?: { position: number; duration: number } | null;
  onTogglePlay?: () => void;
  /** Altura da pilha (dentro de uma tela que rola, precisa ser fixa). */
  height?: number;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const top = cards[0];
  const next = cards[1];

  const finish = (liked: boolean) => {
    if (top) onSwipe(top, liked);
    x.value = 0;
  };

  const fling = (liked: boolean) => {
    x.value = withTiming((liked ? 1 : -1) * width * 1.4, { duration: 220 }, (done) => {
      if (done) scheduleOnRN(finish, liked);
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const passed = Math.abs(x.value) > width * SWIPE_THRESHOLD || Math.abs(e.velocityX) > 900;
      if (passed) {
        const liked = x.value > 0;
        x.value = withTiming((liked ? 1 : -1) * width * 1.4, { duration: 180 }, (done) => {
          if (done) scheduleOnRN(finish, liked);
        });
      } else {
        x.value = withSpring(0);
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${interpolate(x.value, [-width, 0, width], [-12, 0, 12])}deg` }],
  }));
  const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, width * SWIPE_THRESHOLD], [0, 1], 'clamp') }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-width * SWIPE_THRESHOLD, 0], [1, 0], 'clamp') }));
  const nextStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(Math.abs(x.value), [0, width * SWIPE_THRESHOLD], [0.95, 1], 'clamp') }],
  }));

  if (!top) return null;

  return (
    <View style={[styles.wrap, height ? { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' } : null]}>
      <View style={[styles.stack, height ? { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height } : null]}>
        {/* Cartões inclinados atrás, como no Figma */}
        {cards.length > 2 ? <View style={[StyleSheet.absoluteFill, styles.behind, { transform: [{ rotate: '-6deg' }, { scale: 0.92 }] }]} /> : null}
        {cards.length > 1 ? <View style={[StyleSheet.absoluteFill, styles.behind, { transform: [{ rotate: '5deg' }, { scale: 0.94 }] }]} /> : null}
        {next ? (
          <Animated.View key={next.link_preview_id} style={[StyleSheet.absoluteFill, nextStyle]} pointerEvents="none">
            <DiscoverCardView card={next} genreName={genreName(next.genre)} platform={platform} />
          </Animated.View>
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View key={top.link_preview_id} style={[StyleSheet.absoluteFill, topStyle]}>
            <DiscoverCardView card={top} genreName={genreName(top.genre)} platform={platform} onOpen={onOpen} />
            <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]} pointerEvents="none">
              <Text style={styles.stampText}>{t('discover.like')}</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampSkip, skipStyle]} pointerEvents="none">
              <Text style={styles.stampText}>{t('discover.skip')}</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Figma: trocar, pular (X), abrir (play), curtir (estrela), compartilhar */}
      <View style={styles.buttons}>
        <Pressable testID="discover-shuffle" accessibilityRole="button" accessibilityLabel={t('discover.reload')} onPress={onShuffle} hitSlop={12} style={styles.side}>
          <Icon name="swap" size={22} />
        </Pressable>
        <Pressable
          testID="discover-skip"
          accessibilityRole="button"
          accessibilityLabel={t('discover.skip')}
          onPress={() => fling(false)}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <SvgXml xml={icons.skipButton} width={52} height={52} />
        </Pressable>
        {/* Play: toca a prévia de 30 s (a de músicas de outras plataformas vem da Deezer, pelo
            servidor). Sem quem cuide do play (onTogglePlay), abre a música na plataforma. */}
        <Pressable
          testID="discover-play"
          accessibilityRole="button"
          accessibilityLabel={
            onTogglePlay
              ? playing
                ? t('discover.pause')
                : t('discover.play')
              : t('feed.listenOn', { platform: PLATFORM_LABELS[platform ?? top.platform] })
          }
          onPress={() => (onTogglePlay ? onTogglePlay() : onOpen ? onOpen(top) : Linking.openURL(top.url))}
          accessibilityValue={
            seconds ? { min: 0, max: Math.round(seconds.duration), now: Math.round(seconds.position), text: t('discover.previewAt', { s: Math.round(seconds.position) }) } : undefined
          }
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.8 }]}
        >
          {/* Anel da prévia: mostra que é só um trecho (30 s) e quanto já tocou. */}
          {onTogglePlay ? <PreviewRing progress={progress} /> : null}
          <SvgXml xml={playing ? icons.pauseButton : icons.playButton} width={72} height={72} />
        </Pressable>
        <Pressable
          testID="discover-like"
          accessibilityRole="button"
          accessibilityLabel={t('discover.like')}
          onPress={() => fling(true)}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <SvgXml xml={icons.likeButton} width={52} height={52} />
        </Pressable>
        <Pressable
          testID="discover-share"
          accessibilityRole="button"
          accessibilityLabel={t('feed.share')}
          onPress={() => Share.share({ message: `${top.title}${top.artist ? ` · ${top.artist}` : ''}\n${top.url}` }).catch(() => undefined)}
          hitSlop={12}
          style={styles.side}
        >
          <Icon name="shareUp" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const RING = 86;
const STROKE = 3;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/** Anel em volta do play: trilho apagado e o trecho já tocado, começando do topo. */
function PreviewRing({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <Svg width={RING} height={RING} style={StyleSheet.absoluteFill} testID="preview-ring" pointerEvents="none">
      <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.text} strokeOpacity={0.18} strokeWidth={STROKE} fill="none" />
      {p > 0 ? (
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={R}
          stroke={colors.text}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={CIRC * (1 - p)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  play: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  wrap: { flex: 1, gap: space.lg },
  stack: { flex: 1, marginHorizontal: space.xl, marginTop: space.md },
  behind: { borderRadius: 10, backgroundColor: colors.tabBar, opacity: 0.7 },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.md },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', top: space.xl, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 3 },
  stampLike: { left: space.xl, borderColor: colors.primary, transform: [{ rotate: '-12deg' }] },
  stampSkip: { right: space.xl, borderColor: colors.danger, transform: [{ rotate: '12deg' }] },
  stampText: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, textTransform: 'uppercase' },
});
