import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type GenreHit, searchPostGenres, searchProfiles, searchTracks, unblockUser } from '../lib/api';
import { formatError } from '../lib/errors';
import { uniqueBy, useDebouncedValue } from '../lib/hooks';
import { useGenres } from '../lib/queries';
import type { PersonCard, TrackResult } from '../lib/types';
import { colors, fonts, space, text } from '../theme';
import { RingAvatar, SearchField } from './figma';
import { TrendingRow } from './TrendingList';
import { Button } from './ui';
import { PeopleSkeleton, TrackListSkeleton } from './Skeleton';
import { Verified } from './Verified';

export const MIN_QUERY = 2;

/** Nome do gênero no idioma do app. */
function genreName(g: { name_pt: string; name_en: string }, locale: string) {
  return locale === 'pt-BR' ? g.name_pt : g.name_en;
}

/** Sem texto: os gêneros em destaque, para tocar e ver os posts. */
export function GenreBrowser({ onOpenGenre }: { onOpenGenre: (slug: string) => void }) {
  const { t, i18n } = useTranslation();
  const genres = useGenres();
  if (!genres.data?.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.section}>{t('search.browseGenres')}</Text>
      <View style={styles.chips}>
        {genres.data.map((g) => (
          <Pressable
            key={g.slug}
            testID={`browse-genre-${g.slug}`}
            accessibilityRole="link"
            onPress={() => onOpenGenre(g.slug)}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.chipText}>{genreName(g, i18n.language)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}


export function SearchResults({
  query,
  people,
  tracks,
  genres = [],
  loading,
  onOpenProfile,
  onOpenGenre,
  onUnblock,
  unblocking,
}: {
  query: string;
  people: PersonCard[];
  tracks: TrackResult[];
  /** Gêneros que batem com o texto (tocar abre os posts do gênero). */
  genres?: GenreHit[];
  loading: boolean;
  onOpenProfile: (username: string) => void;
  onOpenGenre?: (slug: string) => void;
  /** Desbloquear quem eu bloqueei (aparece marcado na busca). */
  onUnblock?: (person: PersonCard) => void;
  unblocking?: string | null;
}) {
  const { t, i18n } = useTranslation();
  // Vazio: só a lista de gêneros (abaixo); com 1 letra, o aviso.
  if (!query.trim()) return null;
  if (query.trim().length < MIN_QUERY) return <Text style={[text.small, styles.hint]}>{t('search.minChars')}</Text>;
  if (loading)
    return (
      <View style={{ gap: space.lg }}>
        <PeopleSkeleton count={3} />
        <TrackListSkeleton count={3} cover={44} trailing={false} />
      </View>
    );
  if (!people.length && !tracks.length && !genres.length) {
    return <Text style={[text.body, styles.hint]}>{t('search.noResults', { query: query.trim() })}</Text>;
  }
  return (
    <View style={{ gap: space.lg }}>
      {genres.length ? (
        <View style={{ gap: space.xs }}>
          <Text style={styles.section}>{t('search.genres')}</Text>
          {genres.map((g) => (
            <Pressable
              key={g.slug}
              testID={`genre-result-${g.slug}`}
              accessibilityRole="link"
              onPress={() => onOpenGenre?.(g.slug)}
              style={({ pressed }) => [styles.person, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.genreIcon}>
                <Text style={styles.genreHash}>#</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {genreName(g, i18n.language)}
                </Text>
                <Text style={styles.handle}>{t('search.genrePosts', { count: g.post_count })}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {people.length ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.section}>{t('search.people')}</Text>
          {uniqueBy(people, (p) => p.id, 'busca de pessoas').map((p) =>
            p.blocked_by_me ? (
              // Bloqueado por mim: o perfil não abre, mas dá para desbloquear daqui.
              <View key={p.id} testID={`blocked-${p.username}`} style={styles.person}>
                <View style={{ opacity: 0.5 }}>
                  <RingAvatar uri={p.avatar_url} name={p.display_name} size={44} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { opacity: 0.6 }]}>{p.display_name}</Text>
                  <Text style={styles.handle}>
                    @{p.username} · <Text style={styles.blockedTag}>{t('blocked.tag')}</Text>
                  </Text>
                </View>
                {onUnblock ? (
                  <Button
                    testID={`unblock-${p.username}`}
                    size="sm"
                    variant="ghost"
                    title={t('blocked.unblock')}
                    onPress={() => onUnblock(p)}
                    loading={unblocking === p.id}
                  />
                ) : null}
              </View>
            ) : (
              <Pressable
                key={p.id}
                accessibilityRole="link"
                onPress={() => onOpenProfile(p.username)}
                style={({ pressed }) => [styles.person, pressed && { opacity: 0.8 }]}
              >
                <RingAvatar uri={p.avatar_url} name={p.display_name} size={44} />
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.name}>{p.display_name}</Text>
                    <Verified username={p.username} />
                  </View>
                  <Text style={styles.handle}>@{p.username}</Text>
                </View>
              </Pressable>
            ),
          )}
        </View>
      ) : null}
      {tracks.length ? (
        <View style={{ gap: space.xs }}>
          <Text style={styles.section}>{t('search.tracks')}</Text>
          {uniqueBy(tracks, (tr) => tr.link_preview_id, 'busca de músicas').map((tr, i) => (
            <TrendingRow key={tr.link_preview_id} showRank={false} item={{ ...tr, rank: i + 1, like_count: 0, score: 0 }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Gêneros com posts primeiro; os sem post só aparecem (até 3) se nenhum tiver. */
export function relevantGenres(list: GenreHit[]): GenreHit[] {
  const withPosts = list.filter((g) => g.post_count > 0);
  return withPosts.length ? withPosts.slice(0, 5) : list.slice(0, 3);
}

export function SearchPanel() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());
  const enabled = q.length >= MIN_QUERY;
  const people = useQuery({ queryKey: ['search-people', q], queryFn: () => searchProfiles(q), enabled });
  const tracks = useQuery({ queryKey: ['search-tracks', q], queryFn: () => searchTracks(q), enabled });
  const genres = useQuery({ queryKey: ['search-genres-posts', q], queryFn: () => searchPostGenres(q), enabled, staleTime: 60_000 });
  const openGenre = (slug: string) => router.push(`/genre/${slug}`);
  const qc = useQueryClient();
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const unblock = async (person: PersonCard) => {
    setUnblocking(person.id);
    setMessage(null);
    try {
      await unblockUser(person.id);
      // Na hora: a pessoa volta ao normal na busca; o resto do app recarrega.
      qc.setQueryData<PersonCard[]>(['search-people', q], (list) => list?.map((x) => (x.id === person.id ? { ...x, blocked_by_me: false } : x)));
      void qc.invalidateQueries({ queryKey: ['blocked'] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    } catch (err) {
      setMessage(formatError(t, err));
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      <SearchField testID="search-input" value={query} onChangeText={setQuery} placeholder={t('search.placeholder')} />
      <SearchResults
        query={q}
        people={people.data ?? []}
        tracks={tracks.data ?? []}
        // Só os gêneros que têm posts (ou todos, se nenhum tiver): é para achar posts.
        genres={relevantGenres(genres.data ?? [])}
        loading={enabled && (people.isLoading || tracks.isLoading || genres.isLoading)}
        onOpenProfile={(username) => router.push(`/u/${username}`)}
        onOpenGenre={openGenre}
        onUnblock={unblock}
        unblocking={unblocking}
      />
      {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center' }]}>{message}</Text> : null}
      {!enabled ? <GenreBrowser onOpenGenre={openGenre} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  hint: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  blockedTag: { fontFamily: fonts.semibold, color: colors.danger },
  genreIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.handle, alignItems: 'center', justifyContent: 'center' },
  genreHash: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: colors.handle, paddingHorizontal: space.md, paddingVertical: 6 },
  chipText: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
});
