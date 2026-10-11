import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { searchProfiles, searchTracks, unblockUser } from '../lib/api';
import { formatError } from '../lib/errors';
import { useDebouncedValue } from '../lib/hooks';
import type { PersonCard, TrackResult } from '../lib/types';
import { colors, fonts, space, text } from '../theme';
import { RingAvatar, SearchField } from './figma';
import { TrendingRow } from './TrendingList';
import { Button } from './ui';

export const MIN_QUERY = 2;


export function SearchResults({
  query,
  people,
  tracks,
  loading,
  onOpenProfile,
  onUnblock,
  unblocking,
}: {
  query: string;
  people: PersonCard[];
  tracks: TrackResult[];
  loading: boolean;
  onOpenProfile: (username: string) => void;
  /** Desbloquear quem eu bloqueei (aparece marcado na busca). */
  onUnblock?: (person: PersonCard) => void;
  unblocking?: string | null;
}) {
  const { t } = useTranslation();
  if (query.trim().length < MIN_QUERY) return <Text style={[text.small, styles.hint]}>{t('search.minChars')}</Text>;
  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />;
  if (!people.length && !tracks.length) {
    return <Text style={[text.body, styles.hint]}>{t('search.noResults', { query: query.trim() })}</Text>;
  }
  return (
    <View style={{ gap: space.lg }}>
      {people.length ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.section}>{t('search.people')}</Text>
          {people.map((p) =>
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
                  <Text style={styles.name}>{p.display_name}</Text>
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
          {tracks.map((tr, i) => (
            <TrendingRow key={tr.link_preview_id} showRank={false} item={{ ...tr, rank: i + 1, like_count: 0, score: 0 }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function SearchPanel() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());
  const enabled = q.length >= MIN_QUERY;
  const people = useQuery({ queryKey: ['search-people', q], queryFn: () => searchProfiles(q), enabled });
  const tracks = useQuery({ queryKey: ['search-tracks', q], queryFn: () => searchTracks(q), enabled });
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
        loading={enabled && (people.isLoading || tracks.isLoading)}
        onOpenProfile={(username) => router.push(`/u/${username}`)}
        onUnblock={unblock}
        unblocking={unblocking}
      />
      {message ? <Text style={[text.small, { color: colors.danger, textAlign: 'center' }]}>{message}</Text> : null}
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
});
