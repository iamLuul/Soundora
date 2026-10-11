import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DiscoverCard } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { PlatformLogo } from './figma';
import { Avatar } from './ui';

/**
 * Cartão do Descobrir no layout do Figma (Search page/Discover): capa grande com margem,
 * música, artista, quem indicou (ou o selo de destaque) e o logo da plataforma.
 * Tocar na capa abre a música no streaming de origem.
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
      <Pressable accessibilityRole="link" accessibilityLabel={t('feed.listenOn', { platform })} onPress={open} style={styles.coverWrap}>
        {card.image_url ? (
          <Image source={{ uri: card.image_url }} style={styles.cover} contentFit="cover" accessibilityLabel={card.title} />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="musical-notes" size={64} color={colors.muted} />
          </View>
        )}
      </Pressable>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        {card.artist ? (
          <Text style={styles.artist} numberOfLines={1}>
            {card.artist}
          </Text>
        ) : null}
        {card.note ? (
          <Text style={styles.note} numberOfLines={2}>
            “{card.note}”
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.source}>
            {card.source === 'featured' ? (
              <View style={styles.badge}>
                <Ionicons name="sparkles" size={12} color={colors.text} />
                <Text style={styles.badgeText}>{t('discover.featured')}</Text>
              </View>
            ) : card.recommender_username ? (
              <>
                <Avatar uri={card.recommender_avatar_url} name={card.recommender_display_name ?? card.recommender_username} size={28} />
                <Text style={styles.recommender} numberOfLines={1}>
                  {t('discover.recommendedBy', { username: card.recommender_username })}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.right}>
            {genreName ? <Text style={styles.genre}>{genreName}</Text> : null}
            <PlatformLogo platform={card.platform} size={22} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Figma: 308 x 435, fundo #5A5577, raio 10, sombra 25 px.
  card: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.tabBar,
    padding: 20,
    gap: space.md,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  coverWrap: { flex: 1, minHeight: 160 },
  cover: { width: '100%', height: '100%', borderRadius: 4 },
  coverFallback: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, gap: space.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  recommender: { fontFamily: fonts.bold, fontSize: 12, color: colors.text, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  genre: { fontFamily: fonts.semibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
});
