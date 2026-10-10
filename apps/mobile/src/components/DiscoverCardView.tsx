import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DiscoverCard } from '../lib/types';
import { colors, fonts, radius, space, text } from '../theme';
import { Avatar } from './ui';

/**
 * Cartão grande do Descobrir: capa, música, por que ela apareceu (destaque ou
 * indicação de alguém) e o botão que abre no streaming de origem.
 */
export function DiscoverCardView({
  card,
  genreName,
  onOpen,
}: {
  card: DiscoverCard;
  genreName: string | null;
  onOpen?: (url: string) => void;
}) {
  const { t } = useTranslation();
  const platform = PLATFORM_LABELS[card.platform];
  const open = () => (onOpen ? onOpen(card.url) : Linking.openURL(card.url));

  return (
    <View style={styles.card} testID={`discover-card-${card.link_preview_id}`}>
      {card.image_url ? (
        <Image source={{ uri: card.image_url }} style={styles.cover} contentFit="cover" accessibilityLabel={card.title} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Ionicons name="musical-notes" size={64} color={colors.muted} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.badgeRow}>
          {card.source === 'featured' ? (
            <View style={styles.badge}>
              <Ionicons name="sparkles" size={12} color={colors.text} />
              <Text style={styles.badgeText}>{t('discover.featured')}</Text>
            </View>
          ) : card.recommender_username ? (
            <View style={styles.recommender}>
              <Avatar uri={card.recommender_avatar_url} name={card.recommender_display_name ?? card.recommender_username} size={20} />
              <Text style={text.small}>{t('discover.recommendedBy', { username: card.recommender_username })}</Text>
            </View>
          ) : null}
          {genreName ? <Text style={styles.genre}>{genreName}</Text> : null}
        </View>

        <Text style={text.title} numberOfLines={2}>
          {card.title}
        </Text>
        {card.artist ? (
          <Text style={[text.body, { color: colors.textMuted }]} numberOfLines={1}>
            {card.artist}
          </Text>
        ) : null}
        {card.note ? (
          <Text style={text.body} numberOfLines={3}>
            “{card.note}”
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('feed.listenOn', { platform })}
          onPress={open}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="play" size={16} color={colors.text} />
          <Text style={styles.playText}>{t('feed.listenOn', { platform })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 1, maxHeight: 360 },
  coverFallback: { backgroundColor: 'rgba(108, 98, 255, 0.18)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.lg, gap: space.sm },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
  recommender: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  genre: { fontFamily: fonts.semibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  play: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  playText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});
