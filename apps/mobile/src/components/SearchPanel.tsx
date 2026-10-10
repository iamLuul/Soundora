import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchProfiles, searchTracks } from '../lib/api';
import type { Profile, TrackResult } from '../lib/types';
import { colors, fonts, radius, space, text } from '../theme';
import { TrendingRow } from './TrendingList';
import { Avatar } from './ui';

export const MIN_QUERY = 2;

/** Atraso para não buscar a cada tecla. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function SearchResults({
  query,
  people,
  tracks,
  loading,
  onOpenProfile,
}: {
  query: string;
  people: Profile[];
  tracks: TrackResult[];
  loading: boolean;
  onOpenProfile: (username: string) => void;
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
          <Text style={text.label}>{t('search.people')}</Text>
          {people.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="link"
              onPress={() => onOpenProfile(p.username)}
              style={({ pressed }) => [styles.person, pressed && { opacity: 0.8 }]}
            >
              <Avatar uri={p.avatar_url} name={p.display_name} />
              <View>
                <Text style={styles.name}>{p.display_name}</Text>
                <Text style={text.small}>@{p.username}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {tracks.length ? (
        <View style={{ gap: space.xs }}>
          <Text style={text.label}>{t('search.tracks')}</Text>
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

  return (
    <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="search-input"
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('search.placeholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
      </View>
      <SearchResults
        query={q}
        people={people.data ?? []}
        tracks={tracks.data ?? []}
        loading={enabled && (people.isLoading || tracks.isLoading)}
        onOpenProfile={(username) => router.push(`/u/${username}`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  // outlineStyle: tira o contorno de foco do navegador (a caixa já mostra o foco)
  input: { flex: 1, minHeight: 44, color: colors.text, fontFamily: fonts.regular, fontSize: 15, outlineWidth: 0 },
  hint: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  name: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
