import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlbumReview } from '../lib/api';
import { formatRating } from '../lib/reviews';
import { colors, fonts, glass, space } from '../theme';
import { Carousel } from './Carousel';
import { Icon } from './figma';

/** Quantas reviews cabem em cada faixa do Para você. */
export const REVIEWS_PER_STRIP = 5;
/** Faixa com menos que isso não aparece (fica vazia demais). */
export const MIN_REVIEWS_PER_STRIP = 3;

/** Divide as reviews em faixas de até 5 (a última só se tiver 3 ou mais). */
export function reviewStrips(reviews: AlbumReview[]): AlbumReview[][] {
  const strips: AlbumReview[][] = [];
  for (let i = 0; i < reviews.length; i += REVIEWS_PER_STRIP) {
    const chunk = reviews.slice(i, i + REVIEWS_PER_STRIP);
    if (chunk.length >= MIN_REVIEWS_PER_STRIP) strips.push(chunk);
  }
  return strips;
}

/**
 * "Reviews que você pode curtir": faixa que desliza para os lados no meio do Para você, com
 * reviews populares de álbuns do gosto da pessoa. Tocar abre o álbum com as reviews.
 */
export function ReviewStrip({ reviews, index }: { reviews: AlbumReview[]; index: number }) {
  const { t } = useTranslation();
  if (!reviews.length) return null;
  return (
    <View style={styles.wrap} testID={`review-strip-${index}`}>
      <Text style={styles.title} accessibilityRole="header">
        {t('reviewStrip.title')}
      </Text>
      <Carousel contentStyle={styles.row} arrowTestID={`review-strip-${index}`} previousLabel={t('suggest.previous')} nextLabel={t('suggest.next')}>
        {reviews.map((r) => (
          <StripCard key={r.id} review={r} />
        ))}
      </Carousel>
    </View>
  );
}

function StripCard({ review }: { review: AlbumReview }) {
  const { t, i18n } = useTranslation();
  const rating = formatRating(review.rating, i18n.language);
  return (
    <Pressable
      testID={`strip-review-${review.id}`}
      accessibilityRole="link"
      accessibilityLabel={t('reviewStrip.open', {
        album: review.album_title,
        artist: review.album_artist ?? '',
        username: review.author_username,
        rating,
      })}
      onPress={() => router.push(`/album/${review.album_id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.album}>
        {review.album_image_url ? (
          <Image source={{ uri: review.album_image_url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Ionicons name="disc-outline" size={22} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.albumTitle} numberOfLines={2}>
            {review.album_title}
          </Text>
          {review.album_artist ? (
            <Text style={styles.artist} numberOfLines={1}>
              {review.album_artist}
            </Text>
          ) : null}
          <View style={styles.score}>
            <Ionicons name="star" size={12} color={colors.text} />
            <Text style={styles.scoreText}>{t('reviews.rating', { rating })}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.body} numberOfLines={4}>
        {review.body}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.handle} numberOfLines={1}>
          @{review.author_username}
        </Text>
        <View style={styles.likes}>
          <Icon name="heart" size={12} color={colors.textMuted} />
          <Text style={styles.likeCount}>{review.like_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, paddingVertical: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, paddingHorizontal: space.lg },
  row: { gap: space.md, paddingHorizontal: space.lg },
  card: { width: 240, ...glass.card, borderRadius: 18, padding: space.md, gap: space.sm },
  album: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cover: { width: 56, height: 56, borderRadius: 4, backgroundColor: colors.surface },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  score: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.text, minHeight: 68 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle, flexShrink: 1 },
  likes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
