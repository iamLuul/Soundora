import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { fetchDiscoverCards, fetchLikedSongs, fetchRecommendations, swipeDiscover, trackLink } from '../lib/api';
import { formatError } from '../lib/errors';
import { genreLabel, keys, useGenreSearch, useGenres } from '../lib/queries';
import type { DiscoverCard, LikedSong } from '../lib/types';
import { colors, fonts, space, text } from '../theme';
import { DiscoverDeck } from './DiscoverDeck';
import { SearchField } from './figma';
import { searchGenres } from './GenrePicker';
import { useStreamingOpener } from './StreamingOpener';
import { Button } from './ui';
import { VibeAudio } from './vibes/VibeAudio';

/** Quando restam poucos cartões, já busca mais sugestões. */
const REFILL_AT = 3;

/**
 * Junta as sugestões do algoritmo com as indicações da comunidade e os destaques:
 * a cada duas sugestões, uma da comunidade (sem repetir música).
 */
export function mergeDeck(forYou: DiscoverCard[], community: DiscoverCard[]): DiscoverCard[] {
  const out: DiscoverCard[] = [];
  const ids = new Set<string>();
  const a = [...forYou];
  const b = [...community];
  while (a.length || b.length) {
    for (const next of [a.shift(), a.shift(), b.shift()]) {
      if (next && !ids.has(next.link_preview_id)) {
        ids.add(next.link_preview_id);
        out.push(next);
      }
    }
  }
  return out;
}

/** Figma: Search page › Discover — busca de gênero, pilha de cartões, controles e as curtidas. */
export function DiscoverSection() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { height } = useWindowDimensions();
  const genres = useGenres();
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState<DiscoverCard[]>([]);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [refilling, setRefilling] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const liked = useQuery({ queryKey: ['discover-liked'], queryFn: fetchLikedSongs });
  const { open, opening, message, platform, chooser } = useStreamingOpener((target, choice) => trackLink(target.key, choice));
  const label = (slug: string | null) => genreLabel(genres.data, slug, i18n.language);

  // Pilha nova: sugestões do algoritmo + (sem gênero escolhido) indicações da comunidade.
  const base = useQuery({
    queryKey: ['discover-deck', genre],
    queryFn: async () => {
      const [forYou, community] = await Promise.all([fetchRecommendations(genre), genre ? [] : fetchDiscoverCards(10).catch(() => [] as DiscoverCard[])]);
      return mergeDeck(forYou, community);
    },
    staleTime: Infinity,
    retry: false,
  });
  const deck = useMemo(() => {
    const ids = new Set<string>();
    return [...(base.data ?? []), ...extra].filter((c) => !gone.has(c.link_preview_id) && !ids.has(c.link_preview_id) && !!ids.add(c.link_preview_id));
  }, [base.data, extra, gone]);
  const top = deck[0];
  const playing = !!top && playingId === top.link_preview_id;

  const reset = () => {
    setExtra([]);
    setGone(new Set());
    setPlayingId(null);
  };
  const shuffle = () => {
    reset();
    void base.refetch();
  };
  const chooseGenre = (slug: string | null) => {
    reset();
    setGenre(slug);
    setQuery('');
  };

  /** Poucos cartões: busca mais sugestões (o servidor já não manda o que foi visto). */
  const refill = () => {
    if (refilling) return;
    setRefilling(true);
    fetchRecommendations(genre)
      .then((more) => setExtra((e) => [...e, ...more]))
      .catch(() => undefined)
      .finally(() => setRefilling(false));
  };

  const onSwipe = (card: DiscoverCard, isLike: boolean) => {
    setGone((g) => new Set(g).add(card.link_preview_id));
    setPlayingId(null);
    if (deck.length - 1 <= REFILL_AT) refill();
    if (isLike) {
      // Aparece na hora em "Músicas curtidas".
      qc.setQueryData<LikedSong[]>(['discover-liked'], (list) => [
        {
          link_preview_id: card.link_preview_id,
          url: card.url,
          platform: card.platform,
          title: card.title,
          artist: card.artist,
          album: card.album ?? null,
          image_url: card.image_url,
          liked_at: new Date().toISOString(),
        },
        ...(list ?? []).filter((s) => s.link_preview_id !== card.link_preview_id),
      ]);
    }
    swipeDiscover(card, isLike)
      .then(() => (isLike ? qc.invalidateQueries({ queryKey: keys.feed }) : undefined))
      .catch(() => void qc.invalidateQueries({ queryKey: ['discover-liked'] }));
  };

  const unlike = (song: LikedSong) => {
    qc.setQueryData<LikedSong[]>(['discover-liked'], (list) => list?.filter((s) => s.link_preview_id !== song.link_preview_id));
    swipeDiscover({ link_preview_id: song.link_preview_id, post_id: null }, false).catch(() => void qc.invalidateQueries({ queryKey: ['discover-liked'] }));
  };

  const openSong = (s: { link_preview_id: string; title: string; artist: string | null }) => open({ key: s.link_preview_id, title: s.title, artist: s.artist ?? '' });

  // Gêneros: os de destaque batem na hora; o catálogo inteiro vem do servidor.
  const remoteGenres = useGenreSearch(query, 12);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const found = [...searchGenres(genres.data ?? [], query, []), ...(remoteGenres.data ?? [])];
    return found.filter((g, i) => found.findIndex((x) => x.slug === g.slug) === i).slice(0, 12);
  }, [genres.data, query, remoteGenres.data]);

  const stackHeight = Math.max(320, Math.min(460, height * 0.52));

  return (
    <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      {/* Figma: "Search genres" — a pilha passa a ser só desse gênero. */}
      {genre ? (
        <View style={styles.genreChosen}>
          <Text style={styles.genreChosenText}>{t('discover.onlyGenre', { genre: label(genre) ?? genre })}</Text>
          <Pressable testID="discover-genre-clear" accessibilityRole="button" accessibilityLabel={t('discover.allGenres')} onPress={() => chooseGenre(null)} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <SearchField testID="discover-genre-search" value={query} onChangeText={setQuery} placeholder={t('discover.searchGenres')} />
      )}
      {matches.length ? (
        <View style={styles.matches}>
          {matches.map((g) => (
            <Pressable
              key={g.slug}
              testID={`discover-genre-${g.slug}`}
              accessibilityRole="button"
              onPress={() => chooseGenre(g.slug)}
              style={styles.match}
            >
              <Text style={styles.matchText}>{label(g.slug)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {base.isLoading || base.isRefetching ? (
        <View style={[styles.center, { height: stackHeight + 96 }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={text.small}>{t('discover.loading')}</Text>
        </View>
      ) : top ? (
        <>
          <Text style={[text.small, { textAlign: 'center' }]}>{t('discover.hint')}</Text>
          <DiscoverDeck
            cards={deck}
            genreName={label}
            onSwipe={onSwipe}
            onShuffle={shuffle}
            onOpen={openSong}
            platform={platform}
            playing={playing}
            onTogglePlay={() => setPlayingId(playing ? null : top.link_preview_id)}
            height={stackHeight}
          />
          {/* Prévia de 30 s do cartão de cima (a key recomeça a música a cada cartão). */}
          {top.audio_url ? <VibeAudio key={`discover-audio-${top.link_preview_id}`} url={top.audio_url} paused={!playing} muted={false} /> : null}
        </>
      ) : (
        <View style={[styles.center, { height: stackHeight }]}>
          <Text style={[text.body, { textAlign: 'center', color: colors.textMuted }]}>{base.isError ? formatError(t, base.error) : refilling ? t('discover.loading') : t('discover.empty')}</Text>
          <Button testID="discover-reload" title={t('discover.reload')} variant="ghost" onPress={shuffle} />
        </View>
      )}
      {opening ? <ActivityIndicator color={colors.primary} /> : null}
      {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center' }]}>{message}</Text> : null}

      {/* Figma: "Liked songs" — tocar abre na plataforma; a estrela descurte. */}
      <View style={styles.likedHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('discover.likedSongs')}
        </Text>
      </View>
      {liked.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : !liked.data?.length ? (
        <Text style={[text.small, { color: colors.textMuted }]}>{t('discover.likedEmpty')}</Text>
      ) : (
        liked.data.map((s) => (
          <View key={s.link_preview_id} style={styles.likedRow}>
            <Pressable
              testID={`liked-${s.link_preview_id}`}
              accessibilityRole="link"
              accessibilityLabel={t('trending.rowLabel', { position: '', title: s.title, artist: s.artist ?? '' })}
              onPress={() => openSong(s)}
              style={({ pressed }) => [styles.likedMain, pressed && { opacity: 0.8 }]}
            >
              {s.image_url ? (
                <Image source={{ uri: s.image_url }} style={styles.likedCover} contentFit="cover" />
              ) : (
                <View style={[styles.likedCover, styles.coverFallback]}>
                  <Ionicons name="musical-note" size={20} color={colors.muted} />
                </View>
              )}
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.likedTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                {s.artist ? (
                  <Text style={styles.likedArtist} numberOfLines={1}>
                    {s.artist}
                  </Text>
                ) : null}
                {s.album ? (
                  <Text style={styles.likedAlbum} numberOfLines={1}>
                    {s.album}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable testID={`unlike-${s.link_preview_id}`} accessibilityRole="button" accessibilityLabel={t('discover.unlike')} onPress={() => unlike(s)} hitSlop={10}>
              <Ionicons name="star" size={26} color={STAR} />
            </Pressable>
          </View>
        ))
      )}
      {chooser}
    </ScrollView>
  );
}

/** Figma: estrela verde-clara das músicas curtidas. */
const STAR = '#B7FF95';

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  genreChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
  },
  genreChosenText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  matches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  match: { borderRadius: 999, borderWidth: 1, borderColor: colors.handle, paddingHorizontal: space.md, paddingVertical: 6 },
  matchText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  likedHeader: { borderTopWidth: 1, borderTopColor: colors.tabBar, paddingTop: space.md },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  likedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  likedMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  likedCover: { width: 56, height: 56, borderRadius: 4 },
  coverFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  likedTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  likedArtist: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  likedAlbum: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
});
