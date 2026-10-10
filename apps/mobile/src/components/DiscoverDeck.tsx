import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { DiscoverCard } from '../lib/types';
import { colors, fonts, radius, space } from '../theme';
import { DiscoverCardView } from './DiscoverCardView';

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
}: {
  cards: DiscoverCard[];
  genreName: (slug: string | null) => string | null;
  onSwipe: (card: DiscoverCard, liked: boolean) => void;
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
    <View style={styles.wrap}>
      <View style={styles.stack}>
        {next ? (
          <Animated.View key={next.link_preview_id} style={[StyleSheet.absoluteFill, nextStyle]} pointerEvents="none">
            <DiscoverCardView card={next} genreName={genreName(next.genre)} />
          </Animated.View>
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View key={top.link_preview_id} style={[StyleSheet.absoluteFill, topStyle]}>
            <DiscoverCardView card={top} genreName={genreName(top.genre)} />
            <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]} pointerEvents="none">
              <Text style={styles.stampText}>{t('discover.like')}</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampSkip, skipStyle]} pointerEvents="none">
              <Text style={styles.stampText}>{t('discover.skip')}</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.buttons}>
        <Pressable
          testID="discover-skip"
          accessibilityRole="button"
          accessibilityLabel={t('discover.skip')}
          onPress={() => fling(false)}
          style={({ pressed }) => [styles.round, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="close" size={30} color={colors.text} />
        </Pressable>
        <Pressable
          testID="discover-like"
          accessibilityRole="button"
          accessibilityLabel={t('discover.like')}
          onPress={() => fling(true)}
          style={({ pressed }) => [styles.round, styles.roundLike, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="heart" size={28} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: space.lg },
  stack: { flex: 1 },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: space.xxl, paddingBottom: space.md },
  round: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  roundLike: { backgroundColor: colors.primary },
  stamp: { position: 'absolute', top: space.xl, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 3 },
  stampLike: { left: space.xl, borderColor: colors.primary, transform: [{ rotate: '-12deg' }] },
  stampSkip: { right: space.xl, borderColor: colors.danger, transform: [{ rotate: '12deg' }] },
  stampText: { fontFamily: fonts.bold, fontSize: 22, color: colors.text, textTransform: 'uppercase' },
});
