import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { clampRating, REVIEW_RATING_MAX } from '../lib/api';
import { formatRating } from '../lib/reviews';
import { webTouch } from '../lib/touch';
import { colors, fonts, space } from '../theme';

const STARS = 5;
const PER_STAR = REVIEW_RATING_MAX / STARS; // cada estrela vale 2 pontos

/** As 5 estrelas preenchidas até a nota (9,1 = 4 estrelas e meia, quase cheia). */
export function Stars({ rating, size = 16, gap = 4, color = colors.primary }: { rating: number; size?: number; gap?: number; color?: string }) {
  const width = STARS * size + (STARS - 1) * gap;
  const filled = (rating / REVIEW_RATING_MAX) * width;
  // A parte preenchida cobre as estrelas e os espaços entre elas na proporção certa.
  const stars = Math.floor(rating / PER_STAR);
  const partial = (rating % PER_STAR) / PER_STAR;
  const fillWidth = Math.min(width, stars * (size + gap) + partial * size);
  return (
    <View style={{ width, height: size }} pointerEvents="none">
      <View style={[styles.row, { gap }]}>
        {Array.from({ length: STARS }, (_, i) => (
          <Ionicons key={i} name="star-outline" size={size} color={color} />
        ))}
      </View>
      <View style={[StyleSheet.absoluteFill, { width: Number.isFinite(filled) ? fillWidth : 0, overflow: 'hidden' }]}>
        <View style={[styles.row, { gap, width }]}>
          {Array.from({ length: STARS }, (_, i) => (
            <Ionicons key={i} name="star" size={size} color={color} />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Dar a nota: tocar ou arrastar nas 5 estrelas (0 a 10, cada estrela vale 2) e ajuste fino de
 * 0,1 com − e +. Funciona com leitor de tela (aumentar/diminuir).
 */
export function StarRatingInput({ value, onChange, size = 36 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const { t, i18n } = useTranslation();
  const gap = 8;
  const width = STARS * size + (STARS - 1) * gap;
  const [dragging, setDragging] = useState(false);

  const fromX = (x: number) => {
    // Posição → nota, em passos de 0,5 (o ajuste fino é no − e +).
    const raw = (Math.min(Math.max(x, 0), width) / width) * REVIEW_RATING_MAX;
    onChange(clampRating(Math.round(raw * 2) / 2));
  };
  const onTouch = (e: GestureResponderEvent) => fromX(e.nativeEvent.locationX);
  const step = (delta: number) => onChange(clampRating(value + delta));

  return (
    <View style={styles.input}>
      <View style={styles.inputRow}>
        <Pressable
          testID="rating-minus"
          accessibilityRole="button"
          accessibilityLabel={t('reviews.less01')}
          onPress={() => step(-0.1)}
          disabled={value <= 0}
          style={[styles.stepper, webTouch(8), value <= 0 && { opacity: 0.4 }]}
          hitSlop={8}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <View
          testID="rating-stars"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('reviews.yourRating')}
          accessibilityValue={{ min: 0, max: REVIEW_RATING_MAX, now: value, text: t('reviews.ratingLabel', { rating: formatRating(value, i18n.language) }) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5)}
          style={{ width, height: size + 8, justifyContent: 'center' }}
        >
          <Stars rating={value} size={size} gap={gap} />
          {/* Camada por cima que recebe o toque: locationX fica relativo às estrelas todas. */}
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              setDragging(true);
              onTouch(e);
            }}
            onResponderMove={onTouch}
            onResponderRelease={() => setDragging(false)}
            onResponderTerminate={() => setDragging(false)}
          />
        </View>
        <Pressable
          testID="rating-plus"
          accessibilityRole="button"
          accessibilityLabel={t('reviews.more01')}
          onPress={() => step(0.1)}
          disabled={value >= REVIEW_RATING_MAX}
          style={[styles.stepper, webTouch(8), value >= REVIEW_RATING_MAX && { opacity: 0.4 }]}
          hitSlop={8}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
      <Text testID="rating-value" style={[styles.value, dragging && { color: colors.primary }]}>
        {formatRating(value, i18n.language)}
        <Text style={styles.outOf}>/10</Text>
      </Text>
      <Text style={styles.hint}>{t('reviews.starsHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  input: { alignItems: 'center', gap: space.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.handle, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
  outOf: { fontFamily: fonts.regular, fontSize: 16, color: colors.textMuted },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
