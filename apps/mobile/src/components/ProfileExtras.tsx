import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchFavoriteSongs, fetchUserGenres, PROFILE_GENRES_MAX, trackLink } from '../lib/api';
import { genreLabel, useGenres } from '../lib/queries';
import { webTouch } from '../lib/touch';
import { colors, fonts, glass, space } from '../theme';
import { useStreamingOpener } from './StreamingOpener';

const MARGIN = 20;

export const profileKeys = {
  favorites: (userId: string) => ['favorite-songs', userId] as const,
  genres: (userId: string) => ['user-genres', userId] as const,
};

/** Os gêneros que a pessoa escolheu (até 5), acima da bio. Tocar abre os posts do gênero. */
export function ProfileGenres({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const catalog = useGenres();
  const genres = useQuery({ queryKey: profileKeys.genres(userId), queryFn: () => fetchUserGenres(userId), staleTime: 60_000 });
  const list = (genres.data ?? []).slice(0, PROFILE_GENRES_MAX);
  if (!list.length) return null;
  return (
    <View testID="profile-genres" style={styles.genres} accessibilityLabel={t('profile.genresLabel')}>
      {list.map((g) => (
        <Pressable
          key={g}
          testID={`profile-genre-${g}`}
          accessibilityRole="link"
          onPress={() => router.push(`/genre/${g}`)}
          hitSlop={4}
          style={({ pressed }) => [styles.genre, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.genreText} numberOfLines={1}>
            {genreLabel(catalog.data, g, i18n.language) ?? g}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Figma (Profile page): "Músicas favoritas" — até 5 capas com nome e artista. Tocar abre a
 * música na plataforma da pessoa; o dono edita no "⋯" (ou adiciona, se ainda não tem).
 */
export function FavoriteSongs({ userId, isMe }: { userId: string; isMe: boolean }) {
  const { t } = useTranslation();
  const favorites = useQuery({ queryKey: profileKeys.favorites(userId), queryFn: () => fetchFavoriteSongs(userId), staleTime: 60_000 });
  const { open, chooser } = useStreamingOpener((target, choice) => trackLink(target.key, choice));
  const list = favorites.data ?? [];
  // Quem visita não vê o bloco vazio; o dono vê o convite para adicionar.
  if (!favorites.isSuccess || (!list.length && !isMe)) return null;
  const edit = () => router.push('/settings/favorites');

  return (
    <View testID="favorite-songs" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('profile.favoriteSongs')}</Text>
        {isMe ? (
          <Pressable
            testID="edit-favorites"
            accessibilityRole="button"
            accessibilityLabel={t('profile.editFavorites')}
            onPress={edit}
            hitSlop={12}
            style={[styles.more, webTouch(12)]}
          >
            <Ionicons name="ellipsis-vertical" size={14} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {list.length ? (
        <View style={styles.songs}>
          {list.map((s) => (
            <Pressable
              key={s.link_preview_id}
              testID={`favorite-${s.slot}`}
              accessibilityRole="link"
              accessibilityLabel={`${s.title}${s.artist ? `, ${s.artist}` : ''}`}
              onPress={() => open({ key: s.link_preview_id, title: s.title, artist: s.artist ?? '' })}
              style={({ pressed }) => [styles.song, pressed && { opacity: 0.8 }]}
            >
              {s.image_url ? (
                <Image source={{ uri: s.image_url }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverEmpty]}>
                  <Ionicons name="musical-note" size={20} color={colors.muted} />
                </View>
              )}
              <Text style={styles.songTitle} numberOfLines={1}>
                {s.title}
              </Text>
              {s.artist ? (
                <Text style={styles.songArtist} numberOfLines={1}>
                  {s.artist}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {/* Espaços vazios mantêm o tamanho das capas com menos de 5 músicas. */}
          {Array.from({ length: Math.max(0, 5 - list.length) }, (_, i) => (
            <View key={`empty-${i}`} style={styles.song} />
          ))}
        </View>
      ) : (
        <Pressable testID="add-favorites" accessibilityRole="button" onPress={edit} style={({ pressed }) => [styles.add, pressed && { opacity: 0.8 }]}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addTitle}>{t('profile.addFavorites')}</Text>
            <Text style={styles.addHint}>{t('profile.favoritesEmptyMine')}</Text>
          </View>
        </Pressable>
      )}
      {chooser}
    </View>
  );
}

const styles = StyleSheet.create({
  genres: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginHorizontal: MARGIN },
  genre: { borderRadius: 999, ...glass.chip, paddingHorizontal: space.md, paddingVertical: 2, maxWidth: 140 },
  genreText: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  card: { marginHorizontal: MARGIN, borderRadius: 18, ...glass.card, padding: space.md, gap: space.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  more: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  songs: { flexDirection: 'row', gap: space.sm },
  song: { flex: 1, minWidth: 0, gap: 2 },
  cover: { width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: colors.surface },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  songTitle: { fontFamily: fonts.bold, fontSize: 9, color: colors.text, marginTop: 2 },
  songArtist: { fontFamily: fonts.regular, fontSize: 8, color: colors.text },
  add: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  addTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  addHint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
