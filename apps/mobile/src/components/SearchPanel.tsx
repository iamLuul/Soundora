import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type GenreHit, logSearch, searchCommunities, searchPostGenres, searchProfiles, searchTracks, unblockUser } from '../lib/api';
import { CommunityRow } from './communities/CommunityRow';
import { formatError } from '../lib/errors';
import { uniqueBy, useDebouncedValue } from '../lib/hooks';
import { useSearchPosts } from '../lib/queries';
import { PostList } from './PostList';
import type { PersonCard, TrackResult } from '../lib/types';
import { colors, fonts, glass, space, text } from '../theme';
import { RingAvatar, SearchField } from './figma';
import { TrendingRow } from './TrendingList';
import { Button } from './ui';
import { PeopleSkeleton, TrackListSkeleton } from './Skeleton';
import { Verified } from './Verified';
import { useTabBarInset } from './TabBar';

export const MIN_QUERY = 2;
/** Busca no texto dos posts: com menos letras o índice do banco não ajuda. */
export const MIN_POST_QUERY = 3;

/** Nome do gênero no idioma do app. */
function genreName(g: { name_pt: string; name_en: string }, locale: string) {
  return locale === 'pt-BR' ? g.name_pt : g.name_en;
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
  onSearchPosts,
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
  /** Nada achado: procurar a palavra no texto dos posts. */
  onSearchPosts?: () => void;
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
    return (
      <View style={{ alignItems: 'center', gap: space.md }}>
        <Text style={[text.body, styles.hint]}>{t('search.noResults', { query: query.trim() })}</Text>
        {onSearchPosts ? (
          <Button testID="search-posts" size="sm" variant="ghost" title={t('search.searchPosts', { query: query.trim() })} onPress={onSearchPosts} />
        ) : null}
      </View>
    );
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
      {onSearchPosts ? (
        <View style={{ alignItems: 'center' }}>
          <Button testID="search-posts" size="sm" variant="ghost" title={t('search.searchPosts', { query: query.trim() })} onPress={onSearchPosts} />
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

export function SearchPanel({ initialQuery = '' }: { initialQuery?: string } = {}) {
  const tabInset = useTabBarInset();
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const q = useDebouncedValue(query.trim());
  const enabled = q.length >= MIN_QUERY;
  const people = useQuery({ queryKey: ['search-people', q], queryFn: () => searchProfiles(q), enabled });
  const tracks = useQuery({ queryKey: ['search-tracks', q], queryFn: () => searchTracks(q), enabled });
  const genres = useQuery({ queryKey: ['search-genres-posts', q], queryFn: () => searchPostGenres(q), enabled, staleTime: 60_000 });
  const communities = useQuery({ queryKey: ['communities', 'search', q], queryFn: () => searchCommunities(q), enabled });
  // Pesquisas feitas de verdade (Enter, abrir um gênero, buscar nos posts, ou vindo da busca do
  // desktop) vão para o histórico usado nas recomendações; o que é só digitado, não.
  const openGenre = (slug: string) => {
    logSearch(slug.replace(/_/g, ' '));
    router.push(`/genre/${slug}`);
  };
  useEffect(() => {
    if (initialQuery.trim()) logSearch(initialQuery);
  }, [initialQuery]);
  const qc = useQueryClient();
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Ao apertar "pesquisar" (Enter): vai direto para os posts que contêm o termo, mesmo que
  // ele também ache pessoas, músicas ou gêneros. Mudou o texto, volta para a busca normal.
  const [postsFor, setPostsFor] = useState<string | null>(null);
  const loading = enabled && (people.isLoading || tracks.isLoading || genres.isLoading);
  const shownGenres = relevantGenres(genres.data ?? []);
  const showPosts = postsFor !== null;
  const posts = useSearchPosts(showPosts ? postsFor : '');
  const submit = () => {
    const word = query.trim();
    // Com menos de 3 letras não busca nos posts (o índice do banco não ajuda): avisa.
    if (word.length >= MIN_QUERY) logSearch(word);
    if (word.length >= MIN_POST_QUERY) setPostsFor(word);
    else if (word.length >= MIN_QUERY) setMessage(t('search.postsMinChars'));
  };

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
    <View style={{ flex: 1, gap: space.lg }}>
      <SearchField
        testID="search-input"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setPostsFor(null);
          setMessage(null);
        }}
        onSubmitEditing={submit}
        placeholder={t('search.placeholder')}
      />
      {showPosts ? (
        <PostList
          header={<Text style={[styles.section, { paddingBottom: space.sm }]}>{t('search.postsWith', { query: postsFor })}</Text>}
          items={uniqueBy(posts.data?.pages.flat() ?? [], (p) => p.id, 'busca de posts')}
          loading={posts.isLoading}
          onRefresh={() => posts.refetch()}
          onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
          loadingMore={posts.isFetchingNextPage}
          emptyText={t('search.noPosts', { query: postsFor })}
          errorText={posts.isError ? formatError(t, posts.error) : null}
          followable
        />
      ) : (
        <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl + tabInset }} keyboardShouldPersistTaps="handled">
          <SearchResults
            query={q}
            people={people.data ?? []}
            tracks={tracks.data ?? []}
            // Gêneros no topo: só os que têm posts (ou alguns, se nenhum tiver).
            genres={shownGenres}
            loading={loading}
            onOpenProfile={(username) => router.push(`/u/${username}`)}
            onOpenGenre={openGenre}
            onUnblock={unblock}
            unblocking={unblocking}
            onSearchPosts={
              query.trim().length >= MIN_POST_QUERY
                ? () => {
                    logSearch(query.trim());
                    setPostsFor(query.trim());
                  }
                : undefined
            }
          />
          {enabled && communities.data?.length ? (
            <View testID="search-communities">
              <Text style={styles.section}>{t('communities.title')}</Text>
              {communities.data.slice(0, 5).map((c) => (
                <View key={c.id} style={{ marginHorizontal: -space.lg }}>
                  <CommunityRow item={c} />
                </View>
              ))}
            </View>
          ) : null}
          {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center' }]}>{message}</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  hint: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  blockedTag: { fontFamily: fonts.semibold, color: colors.danger },
  genreIcon: { width: 44, height: 44, borderRadius: 22, ...glass.chip, alignItems: 'center', justifyContent: 'center' },
  genreHash: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
});
