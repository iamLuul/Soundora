import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { previewUsable, type StreamingChoice } from '@soundhora/core';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { fetchDiscoverCards, fetchRecommendations, refreshDiscoverAudio, swipeDiscover, trackLink } from '../lib/api';
import { formatError } from '../lib/errors';
import { genreLabel, keys, useGenreSearch, useGenres } from '../lib/queries';
import type { DiscoverCard, LikedSong } from '../lib/types';
import { colors, fonts, glass, space, text } from '../theme';
import { DiscoverDeck } from './DiscoverDeck';
import { DiscoverLiked } from './DiscoverLiked';
import { SearchField } from './figma';
import { searchGenres } from './GenrePicker';
import { useStreamingOpener } from './StreamingOpener';
import { Button } from './ui';
import { VibeAudio } from './vibes/VibeAudio';
import { useWebLayout } from '../lib/layout';
import { DeckSkeleton } from './Skeleton';
import { webTouch } from '../lib/touch';
import { Spinner } from './Spinner';
import { CoachMarks, type CoachStep, useFirstTimeTip } from './CoachMarks';
import { router, useIsFocused } from 'expo-router';
import { useTabBarInset } from './TabBar';

/** Quando restam poucos cartões, já busca mais sugestões. */
const REFILL_AT = 3;

/**
 * Junta as sugestões do algoritmo com as indicações da comunidade e os destaques:
 * a cada duas sugestões, uma da comunidade (sem repetir música).
 */
/** Plataformas que oferecem prévia a apps (as outras: só o link e a capa delas). */
export function hasPreviews(platform: StreamingChoice | null | undefined): boolean {
  return platform === 'deezer' || platform === 'apple_music';
}

/**
 * O cartão só com o que é da plataforma da pessoa: indicações da comunidade (links de qualquer
 * plataforma) perdem a capa e a foto do artista quando o link é de outra plataforma. As
 * sugestões do algoritmo já chegam assim do servidor.
 */
export function onlyPlatform(card: DiscoverCard, platform: StreamingChoice | null | undefined): DiscoverCard {
  if (card.source === 'for_you' || card.platform === platform) return card;
  return { ...card, image_url: null, artist_image_url: null, audio_url: null };
}

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
  const tabInset = useTabBarInset();
  const { t, i18n } = useTranslation();
  // Primeira vez no Descobrir: como curtir, pular e ouvir.
  const [tipOpen, closeTip] = useFirstTimeTip('discover');
  // A aba pode estar montada fora da tela (carrossel das abas): a dica espera ela abrir.
  const focused = useIsFocused();
  const qc = useQueryClient();
  const { height } = useWindowDimensions();
  const genres = useGenres();
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState<DiscoverCard[]>([]);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [refilling, setRefilling] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  // Desktop largo: as curtidas ficam na coluna da direita.
  const likedInPanel = useWebLayout() === 'wide';
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
    return [...(base.data ?? []), ...extra]
      .filter((c) => !gone.has(c.link_preview_id) && !ids.has(c.link_preview_id) && !!ids.add(c.link_preview_id))
      .map((c) => onlyPlatform(c, platform));
  }, [base.data, extra, gone, platform]);
  // Prévia só de quem ouve pela Deezer ou pela Apple Music (cada um a da sua plataforma).
  const canPreview = hasPreviews(platform);
  const top = deck[0];
  const playing = !!top && playingId === top.link_preview_id;

  // Prévia: link renovado (a da Deezer vence), quanto já tocou e falhas.
  const [freshAudio, setFreshAudio] = useState<Record<string, string | null>>({});
  const [retried, setRetried] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<{ id: string; position: number; duration: number } | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioOf = (card: DiscoverCard) => (card.link_preview_id in freshAudio ? freshAudio[card.link_preview_id] : card.audio_url) ?? null;
  const topAudio = top ? audioOf(top) : null;

  /** Pede ao servidor uma prévia nova; sem prévia, para e avisa. */
  const renewAudio = (card: DiscoverCard) => {
    refreshDiscoverAudio(card.link_preview_id)
      .then((url) => {
        setFreshAudio((m) => ({ ...m, [card.link_preview_id]: url }));
        if (!url) {
          setPlayingId((id) => (id === card.link_preview_id ? null : id));
          setAudioError(t('discover.previewUnavailable'));
        }
      })
      .catch(() => {
        setPlayingId((id) => (id === card.link_preview_id ? null : id));
        setAudioError(t('discover.previewUnavailable'));
      });
  };

  /**
   * Toca a prévia do cartão. Sem prévia ainda (indicações da comunidade com link do Spotify,
   * YouTube etc.) ou com o link vencido, pede ao servidor, que acha a mesma música na Deezer.
   */
  const play = (card: DiscoverCard | undefined) => {
    setAudioError(null);
    if (!card) {
      setPlayingId(null);
      return;
    }
    // Já sabemos que não tem prévia: só avisa.
    if (card.link_preview_id in freshAudio && !freshAudio[card.link_preview_id]) {
      setPlayingId(null);
      setAudioError(t('discover.previewUnavailable'));
      return;
    }
    setPlayingId(card.link_preview_id);
    if (!previewUsable(audioOf(card))) renewAudio(card);
  };

  const topId = top?.link_preview_id;
  const onAudioProgress = useCallback(
    (position: number, duration: number) => {
      if (topId) setProgress({ id: topId, position, duration: duration > 0 ? duration : 30 });
    },
    [topId],
  );
  const onAudioEnded = useCallback(() => {
    setPlayingId(null);
    setProgress(null);
  }, []);
  const onAudioError = useCallback(() => {
    if (!top) return;
    // Uma nova tentativa com link novo; falhou de novo, desiste desta prévia.
    if (!retried.has(top.link_preview_id)) {
      setRetried((r) => new Set(r).add(top.link_preview_id));
      renewAudio(top);
    } else {
      setPlayingId(null);
      setAudioError(t('discover.previewUnavailable'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, retried]);
  const ringProgress = progress && top && progress.id === top.link_preview_id ? progress.position / progress.duration : 0;

  const reset = () => {
    setExtra([]);
    setGone(new Set());
    setPlayingId(null);
    setProgress(null);
    setAudioError(null);
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
    setProgress(null);
    // A próxima já começa a tocar (o arrasto/toque conta como gesto, então o navegador deixa).
    play(deck.find((c) => c.link_preview_id !== card.link_preview_id));
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
      .then(() => {
        if (!isLike) return;
        void qc.invalidateQueries({ queryKey: keys.feed });
        void qc.invalidateQueries({ queryKey: ['profile'] });
        void qc.invalidateQueries({ queryKey: ['liked-songs'] });
      })
      .catch(() => void qc.invalidateQueries({ queryKey: ['discover-liked'] }));
  };

  const openSong = (s: { link_preview_id: string; title: string; artist: string | null }) =>
    open({ key: s.link_preview_id, title: s.title, artist: s.artist ?? '' });

  // Gêneros: os de destaque batem na hora; o catálogo inteiro vem do servidor.
  const remoteGenres = useGenreSearch(query, 12);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const found = [...searchGenres(genres.data ?? [], query, []), ...(remoteGenres.data ?? [])];
    return found.filter((g, i) => found.findIndex((x) => x.slug === g.slug) === i).slice(0, 12);
  }, [genres.data, query, remoteGenres.data]);

  const stackHeight = Math.max(320, Math.min(460, height * 0.52));

  const discoverTips: CoachStep[] = [
    { icon: 'swap-horizontal', title: t('tips.discoverSwipeTitle'), body: t('tips.discoverSwipeBody') },
    { icon: 'play', title: t('tips.discoverPlayTitle'), body: t('tips.discoverPlayBody') },
    { icon: 'star', title: t('tips.discoverLikedTitle'), body: t('tips.discoverLikedBody') },
  ];

  return (
    <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xxl + tabInset }} keyboardShouldPersistTaps="handled">
      <CoachMarks testID="coach-discover" visible={tipOpen && focused} steps={discoverTips} onClose={closeTip} />
      {/* Figma: "Search genres" — a pilha passa a ser só desse gênero. */}
      {genre ? (
        <View style={styles.genreChosen}>
          <Text style={styles.genreChosenText}>{t('discover.onlyGenre', { genre: label(genre) ?? genre })}</Text>
          <Pressable
            testID="discover-genre-clear"
            accessibilityRole="button"
            accessibilityLabel={t('discover.allGenres')}
            onPress={() => chooseGenre(null)}
            hitSlop={10}
            style={webTouch(10)}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <SearchField testID="discover-genre-search" value={query} onChangeText={setQuery} placeholder={t('discover.searchGenres')} />
      )}
      {matches.length ? (
        <View style={styles.matches}>
          {matches.map((g) => (
            <Pressable key={g.slug} testID={`discover-genre-${g.slug}`} accessibilityRole="button" onPress={() => chooseGenre(g.slug)} style={styles.match}>
              <Text style={styles.matchText}>{label(g.slug)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Sem plataforma escolhida: sem prévias (cada prévia é da plataforma de quem ouve). */}
      {!platform ? (
        <View testID="discover-choose-platform" style={styles.choose}>
          <Text style={styles.chooseText}>{t('discover.choosePlatform')}</Text>
          <Pressable testID="discover-choose-platform-button" accessibilityRole="button" onPress={() => router.push('/settings/streaming')} hitSlop={6}>
            <Text style={styles.chooseLink}>{t('discover.choosePlatformAction')}</Text>
          </Pressable>
        </View>
      ) : null}

      {base.isLoading || base.isRefetching ? (
        <View style={{ gap: space.sm }}>
          <DeckSkeleton height={stackHeight} />
          <Text style={[text.small, { textAlign: 'center' }]}>{t('discover.loading')}</Text>
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
            progress={ringProgress}
            seconds={progress && progress.id === top.link_preview_id ? { position: progress.position, duration: progress.duration } : null}
            // Sem prévia na plataforma da pessoa, o botão grande abre a música nela.
            onTogglePlay={canPreview ? () => (playing ? setPlayingId(null) : play(top)) : undefined}
            height={stackHeight}
          />
          {/* Prévia de 30 s do cartão de cima (a key recomeça a música a cada cartão). */}
          {canPreview && topAudio && previewUsable(topAudio) ? (
            <VibeAudio
              key={`discover-audio-${top.link_preview_id}-${topAudio}`}
              url={topAudio}
              paused={!playing}
              muted={false}
              onProgress={onAudioProgress}
              onEnded={onAudioEnded}
              onError={onAudioError}
            />
          ) : null}
          {audioError ? <Text style={[text.small, { color: colors.textMuted, textAlign: 'center' }]}>{audioError}</Text> : null}
        </>
      ) : (
        <View style={[styles.center, { height: stackHeight }]}>
          <Text style={[text.body, { textAlign: 'center', color: colors.textMuted }]}>
            {base.isError
              ? formatError(t, base.error)
              : refilling
                ? t('discover.loading')
                : // Com um gênero escolhido, a pilha não completa com outras músicas: só avisa.
                  genre
                  ? t('discover.genreEmpty', { genre: label(genre) })
                  : t('discover.empty')}
          </Text>
          <Button testID="discover-reload" title={base.isError ? t('common.retry') : t('discover.reload')} variant="ghost" onPress={shuffle} />
        </View>
      )}
      {opening ? <Spinner /> : null}
      {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center' }]}>{message}</Text> : null}

      {/* Figma: "Liked songs" — tocar abre na plataforma; a estrela descurte. */}
      {likedInPanel ? null : <DiscoverLiked />}
      {chooser}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  choose: { ...glass.card, borderRadius: 18, padding: space.md, gap: space.xs },
  chooseText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  chooseLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
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
  match: { borderRadius: 999, ...glass.chip, paddingHorizontal: space.md, paddingVertical: 6 },
  matchText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
});
