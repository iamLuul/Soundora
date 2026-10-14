import Ionicons from '@expo/vector-icons/Ionicons';
import { PLATFORM_LABELS, type StreamingChoice } from '@soundora/core';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DiscoverCard } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { PlatformLogo } from './figma';
import { Avatar } from './ui';
import { webTouch } from '../lib/touch';

/**
 * Cartão do Descobrir no layout do Figma (Search page/Discover): capa grande com margem,
 * música, álbum, artista (com a foto), o motivo da sugestão e o logo da plataforma da pessoa.
 * Tocar na capa ou no logo abre a música na plataforma de streaming dela.
 */
export function DiscoverCardView({
  card,
  genreName,
  onOpen,
  platform,
}: {
  card: DiscoverCard;
  genreName: string | null;
  onOpen?: (card: DiscoverCard) => void;
  /** Plataforma da pessoa (sem ela, a da origem do link). */
  platform?: StreamingChoice | null;
}) {
  const { t } = useTranslation();
  const target = platform ?? card.platform;
  const label = PLATFORM_LABELS[target];
  const open = () => (onOpen ? onOpen(card) : Linking.openURL(card.url));
  // De onde é a prévia: a que veio no cartão, ou a plataforma da pessoa se ela tem prévias.
  const credit = card.preview_platform ?? (platform === 'deezer' || platform === 'apple_music' ? platform : null);

  const reason =
    card.source === 'for_you'
      ? card.reason === 'similar' && card.because
        ? t('discover.because', { track: card.because })
        : card.reason === 'genre' && genreName
          ? t('discover.becauseGenre', { genre: genreName })
          : card.reason === 'popular'
            ? t('discover.becausePopular')
            : null
      : null;

  return (
    <View style={styles.card} testID={`discover-card-${card.link_preview_id}`}>
      <Pressable accessibilityRole="link" accessibilityLabel={t('feed.listenOn', { platform: label })} onPress={open} style={styles.coverWrap}>
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
        {card.album ? (
          <Text style={styles.album} numberOfLines={1}>
            {card.album}
          </Text>
        ) : null}
        {card.artist ? (
          <Text style={styles.artist} numberOfLines={1}>
            {card.artist}
          </Text>
        ) : null}
        {reason ? (
          <Text testID="discover-reason" style={styles.reason} numberOfLines={1}>
            {reason}
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
            ) : card.artist_image_url ? (
              // Figma: foto do artista no canto do cartão.
              <Image source={{ uri: card.artist_image_url }} style={styles.artistPhoto} contentFit="cover" accessibilityLabel={card.artist ?? undefined} />
            ) : null}
          </View>
          <View style={styles.right}>
            {genreName && card.source !== 'for_you' ? <Text style={styles.genre}>{genreName}</Text> : null}
            {/* Crédito da prévia (os termos da Deezer e da Apple pedem a marca junto do áudio). */}
            {credit ? (
              <Text testID="discover-preview-credit" style={styles.credit}>
                {t('discover.previewBy', { platform: PLATFORM_LABELS[credit] })}
              </Text>
            ) : null}
            <Pressable testID="discover-platform" accessibilityRole="link" accessibilityLabel={t('feed.listenOn', { platform: label })} onPress={open} hitSlop={8} style={webTouch(8)}>
              <PlatformLogo platform={target} size={24} />
            </Pressable>
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
  coverWrap: { flex: 1, minHeight: 140 },
  cover: { width: '100%', height: '100%', borderRadius: 4 },
  coverFallback: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 1 },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  album: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  artist: { fontFamily: fonts.bold, fontSize: 12, color: colors.text, marginTop: space.sm },
  reason: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMutedOnSurface, marginTop: 2 },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.sm, gap: space.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  artistPhoto: { width: 40, height: 40, borderRadius: 4 },
  recommender: { fontFamily: fonts.bold, fontSize: 12, color: colors.text, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  genre: { fontFamily: fonts.semibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  credit: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMutedOnSurface },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text },
});
