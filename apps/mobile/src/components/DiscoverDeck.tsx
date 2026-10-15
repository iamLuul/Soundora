import { useTranslation } from 'react-i18next';
import { PLATFORM_LABELS, type StreamingChoice } from '@soundhora/core';
import * as Linking from 'expo-linking';
import { Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, SvgXml } from 'react-native-svg';
import { icons } from '../assets/icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
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
  // Qual cartão está sendo arrastado/jogado. Só ele anda com x. Quando ele sai e a pilha anda,
  // o novo cartão de cima tem outro id: fica no centro sem precisar zerar x antes da tela
  // trocar (antes, x voltava a 0 um instante antes e o cartão antigo reaparecia: a "piscada").
  const activeId = useSharedValue<string | null>(null);
  const top = cards[0];
  const next = cards[1];
  const topId = top?.link_preview_id ?? null;

  const finish = (liked: boolean) => {
    if (top) onSwipe(top, liked);
  };

  const throwCard = (liked: boolean, duration: number) => {
    'worklet';
    x.value = withTiming((liked ? 1 : -1) * width * 1.4, { duration }, (done) => {
      if (done) scheduleOnRN(finish, liked);
    });
  };

  const fling = (liked: boolean) => {
    if (!topId) return;
    if (activeId.value !== topId) {
      activeId.value = topId;
      x.value = 0;
    }
    throwCard(liked, 220);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onStart(() => {
      activeId.value = topId;
      x.value = 0;
    })
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const passed = Math.abs(x.value) > width * SWIPE_THRESHOLD || Math.abs(e.velocityX) > 900;
      if (passed) throwCard(x.value > 0, 180);
      else x.value = withSpring(0);
    });

  if (!top) return null;

  // Os dois cartões ficam lado a lado na mesma lista, com a key do cartão: quando o de baixo
  // vira o de cima, é o mesmo componente (a capa não recarrega).
  const visible = [next, top].filter((c): c is DiscoverCard => !!c);

  return (
    <View style={[styles.wrap, height ? { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' } : null]}>
      <GestureDetector gesture={pan}>
        <View style={[styles.stack, height ? { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height } : null]}>
          {/* Cartões inclinados atrás, como no Figma */}
          {cards.length > 2 ? <View style={[StyleSheet.absoluteFill, styles.behind, { transform: [{ rotate: '-6deg' }, { scale: 0.92 }] }]} /> : null}
          {cards.length > 1 ? <View style={[StyleSheet.absoluteFill, styles.behind, { transform: [{ rotate: '5deg' }, { scale: 0.94 }] }]} /> : null}
          {visible.map((card) => (
            <DeckCard
              key={card.link_preview_id}
              card={card}
              isTop={card.link_preview_id === topId}
              topId={topId}
              x={x}
              activeId={activeId}
              width={width}
              genreName={genreName}
              platform={platform}
              onOpen={onOpen}
            />
          ))}
        </View>
      </GestureDetector>

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
        {/* Play: toca a prévia de 30 s da plataforma da pessoa (Deezer ou Apple Music). Sem
            prévia na plataforma dela (onTogglePlay ausente), abre a música nela. */}
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

/** Um cartão da pilha: o de cima anda com o dedo; o de baixo cresce enquanto o de cima sai. */
function DeckCard({
  card,
  isTop,
  topId,
  x,
  activeId,
  width,
  genreName,
  platform,
  onOpen,
}: {
  card: DiscoverCard;
  isTop: boolean;
  topId: string | null;
  x: SharedValue<number>;
  activeId: SharedValue<string | null>;
  width: number;
  genreName: (slug: string | null) => string | null;
  platform?: StreamingChoice | null;
  onOpen?: (card: DiscoverCard) => void;
}) {
  const { t } = useTranslation();
  const id = card.link_preview_id;
  const style = useAnimatedStyle(() => {
    // O de cima só anda se for ele o cartão em movimento.
    const moving = isTop && activeId.value === id ? x.value : 0;
    if (isTop) return { transform: [{ translateX: moving }, { rotate: `${interpolate(moving, [-width, 0, width], [-12, 0, 12])}deg` }] };
    // O de baixo cresce conforme o de cima (o atual) se afasta.
    const away = activeId.value === topId ? Math.abs(x.value) : 0;
    return { transform: [{ scale: interpolate(away, [0, width * SWIPE_THRESHOLD], [0.95, 1], 'clamp') }] };
  });
  const likeStyle = useAnimatedStyle(() => ({
    opacity: isTop && activeId.value === id ? interpolate(x.value, [0, width * SWIPE_THRESHOLD], [0, 1], 'clamp') : 0,
  }));
  const skipStyle = useAnimatedStyle(() => ({
    opacity: isTop && activeId.value === id ? interpolate(x.value, [-width * SWIPE_THRESHOLD, 0], [1, 0], 'clamp') : 0,
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents={isTop ? 'auto' : 'none'}>
      <DiscoverCardView card={card} genreName={genreName(card.genre)} platform={platform} onOpen={isTop ? onOpen : undefined} />
      {isTop ? (
        <>
          <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]} pointerEvents="none">
            <Text style={styles.stampText}>{t('discover.like')}</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampSkip, skipStyle]} pointerEvents="none">
            <Text style={styles.stampText}>{t('discover.skip')}</Text>
          </Animated.View>
        </>
      ) : null}
    </Animated.View>
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
  stampLike: { left: space.xl, borderColor: colors.success, transform: [{ rotate: '-12deg' }] },
  stampSkip: { right: space.xl, borderColor: colors.danger, transform: [{ rotate: '12deg' }] },
  stampText: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, textTransform: 'uppercase' },
});
