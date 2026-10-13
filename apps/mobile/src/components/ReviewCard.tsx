import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlbumReview } from '../lib/api';
import { relativeTime } from '../lib/i18n';
import { formatRating } from '../lib/reviews';
import { webTouch } from '../lib/touch';
import { colors, fonts, space } from '../theme';
import { Icon, RingAvatar } from './figma';
import { Verified } from './Verified';

/** Linhas do texto antes do "ver mais". */
const COLLAPSED_LINES = 8;

/**
 * Review de álbum (Figma: Home page/Reviews): autor, capa com título, artista, ano e a nota
 * "★ 9.1/10", o texto da review e as curtidas.
 */
export function ReviewCard({
  review,
  onToggleLike,
  onMore,
  onOpenAlbum,
}: {
  review: AlbumReview;
  onToggleLike: (r: AlbumReview) => void;
  onMore?: (r: AlbumReview) => void;
  onOpenAlbum?: (r: AlbumReview) => void;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const rating = formatRating(review.rating, i18n.language);

  return (
    <View testID={`review-${review.id}`} style={styles.card}>
      <View style={styles.header}>
        <Link href={`/u/${review.author_username}`} asChild>
          <Pressable style={styles.author} accessibilityRole="link">
            <RingAvatar uri={review.author_avatar_url} name={review.author_display_name} size={38} />
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                  {review.author_display_name}
                </Text>
                <Verified username={review.author_username} />
              </View>
              <Text style={styles.handle} numberOfLines={1}>
                @{review.author_username}
              </Text>
            </View>
          </Pressable>
        </Link>
        {onMore ? (
          <Pressable
            testID={`review-more-${review.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('feed.postOptions')}
            hitSlop={12}
            onPress={() => onMore(review)}
            style={[styles.more, webTouch(12, { vertical: 2, horizontal: space.sm })]}
          >
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        testID={`review-album-${review.id}`}
        accessibilityRole="link"
        accessibilityLabel={`${review.album_title}${review.album_artist ? `, ${review.album_artist}` : ''}`}
        onPress={onOpenAlbum ? () => onOpenAlbum(review) : undefined}
        disabled={!onOpenAlbum}
        style={({ pressed }) => [styles.album, pressed && { opacity: 0.8 }]}
      >
        {review.album_image_url ? (
          <Image source={{ uri: review.album_image_url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Ionicons name="disc-outline" size={28} color={colors.textMuted} />
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
          {review.album_year ? <Text style={styles.year}>{review.album_year}</Text> : null}
          <View style={styles.score} accessible accessibilityLabel={t('reviews.ratingLabel', { rating })}>
            <Ionicons name="star" size={14} color={colors.text} />
            <Text style={styles.scoreText}>{t('reviews.rating', { rating })}</Text>
          </View>
        </View>
      </Pressable>

      <View style={{ gap: 2 }}>
        <Text style={styles.label}>{t('reviews.label')}</Text>
        <Text
          testID={`review-body-${review.id}`}
          style={styles.body}
          numberOfLines={expanded ? undefined : COLLAPSED_LINES}
          onTextLayout={(e) => {
            if (!expanded && e.nativeEvent.lines.length >= COLLAPSED_LINES) setTruncated(true);
          }}
        >
          {review.body}
        </Text>
        {truncated || review.body.length > 600 ? (
          <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} hitSlop={8} style={webTouch(8)}>
            <Text style={styles.moreText}>{expanded ? t('reviews.less') : t('reviews.more')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          testID={`review-like-${review.id}`}
          accessibilityRole="button"
          accessibilityLabel={review.liked_by_me ? t('reviews.unlike') : t('reviews.like')}
          accessibilityState={{ selected: review.liked_by_me }}
          onPress={() => onToggleLike(review)}
          style={[styles.action, webTouch(10)]}
          hitSlop={10}
        >
          <Icon name={review.liked_by_me ? 'heartFilled' : 'heart'} size={14} color={review.liked_by_me ? colors.primary : colors.text} />
          <Text style={styles.count}>{review.like_count}</Text>
        </Pressable>
        <Text style={styles.time} numberOfLines={1}>
          {relativeTime(review.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  more: { gap: 2, paddingHorizontal: space.sm, paddingVertical: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.text },
  album: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  cover: { width: 76, height: 76, borderRadius: 4, backgroundColor: colors.card },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  year: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  score: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scoreText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  label: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  moreText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primary, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  time: { marginLeft: 'auto', fontFamily: fonts.regular, fontSize: 10, color: colors.text },
});
