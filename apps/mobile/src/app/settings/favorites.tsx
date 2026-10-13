import Ionicons from '@expo/vector-icons/Ionicons';
import { extractFirstUrl, parseStreamingUrl } from '@soundora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SearchField } from '../../components/figma';
import { profileKeys } from '../../components/ProfileExtras';
import { Spinner } from '../../components/Spinner';
import { Button, ErrorText, Screen } from '../../components/ui';
import { FAVORITE_SONGS_MAX, fetchFavoriteSongs, pickSong, previewLink, searchSongs, setFavoriteSongs, type FavoriteSong, type SongHit } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AppError, formatError } from '../../lib/errors';
import { useDebouncedValue } from '../../lib/hooks';
import { webTouch } from '../../lib/touch';
import { colors, fonts, space, text } from '../../theme';

type Song = Omit<FavoriteSong, 'slot'>;

/** Perfil › Músicas favoritas: escolher até 5 (busca pelo nome ou link), ordenar e salvar. */
export default function FavoritesScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile?.id ?? '';
  const current = useQuery({ queryKey: profileKeys.favorites(me), queryFn: () => fetchFavoriteSongs(me), enabled: !!me });
  // Lista em edição: começa com as atuais; só vai para o servidor no Salvar.
  const [draft, setDraft] = useState<Song[] | null>(null);
  const list: Song[] = draft ?? current.data ?? [];
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 400);
  const results = useQuery({ queryKey: ['song-search', q], queryFn: () => searchSongs(q), enabled: q.length >= 2, staleTime: 5 * 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const full = list.length >= FAVORITE_SONGS_MAX;

  const add = (song: Song) => {
    if (full || list.some((s) => s.link_preview_id === song.link_preview_id)) return;
    setDraft([...list, song]);
  };
  const move = (i: number, delta: number) => {
    const next = [...list];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item!);
    setDraft(next);
  };
  const remove = (i: number) => setDraft(list.filter((_, j) => j !== i));

  const choose = async (hit: SongHit) => {
    setError(null);
    setBusy(hit.id);
    try {
      add(await pickSong(hit.id));
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const fromLink = async () => {
    setError(null);
    const url = extractFirstUrl(link);
    const parsed = url ? parseStreamingUrl(url) : null;
    if (!url || !parsed || !['track', 'video', 'unknown'].includes(parsed.kind)) return setError(formatError(t, new AppError('not_song')));
    setBusy('link');
    try {
      const p = await previewLink(url);
      if (p.kind !== 'track' && p.kind !== 'video') throw new AppError('not_song');
      add({ link_preview_id: p.id, title: p.title, artist: p.artist, image_url: p.image_url, url: p.url, platform: p.platform });
      setLink('');
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setError(null);
    setBusy('save');
    try {
      await setFavoriteSongs(list.map((s) => s.link_preview_id));
      await qc.invalidateQueries({ queryKey: profileKeys.favorites(me) });
      router.back();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const hits = (results.data ?? []).filter((h) => !list.some((s) => s.title === h.title && s.artist === h.artist));

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: space.lg }}>
      <Stack.Screen options={{ title: t('favorites.title') }} />
      <Text style={text.small}>{t('favorites.hint')}</Text>

      {current.isLoading ? (
        <Spinner />
      ) : list.length ? (
        <View style={{ gap: space.sm }}>
          {list.map((s, i) => (
            <View key={s.link_preview_id} testID={`fav-row-${i + 1}`} style={styles.row}>
              <Text style={styles.slot}>{i + 1}</Text>
              <Cover uri={s.image_url} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {s.title}
                </Text>
                {s.artist ? (
                  <Text style={styles.artist} numberOfLines={1}>
                    {s.artist}
                  </Text>
                ) : null}
              </View>
              <IconButton testID={`fav-up-${i + 1}`} icon="chevron-up" label={t('favorites.up', { title: s.title })} disabled={i === 0} onPress={() => move(i, -1)} />
              <IconButton
                testID={`fav-down-${i + 1}`}
                icon="chevron-down"
                label={t('favorites.down', { title: s.title })}
                disabled={i === list.length - 1}
                onPress={() => move(i, 1)}
              />
              <IconButton testID={`fav-remove-${i + 1}`} icon="close" label={t('favorites.remove', { title: s.title })} onPress={() => remove(i)} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={[text.small, { textAlign: 'center' }]}>{t('favorites.empty')}</Text>
      )}

      {full ? (
        <Text style={[text.small, { textAlign: 'center' }]}>{t('favorites.full')}</Text>
      ) : (
        <View style={{ gap: space.md }}>
          <SearchField testID="song-search" value={query} onChangeText={setQuery} placeholder={t('favorites.search')} />
          {results.isFetching && !hits.length ? <Spinner /> : null}
          {q.length >= 2 && results.isSuccess && !results.data?.length ? <Text style={[text.small, { textAlign: 'center' }]}>{t('favorites.noResults', { query: q })}</Text> : null}
          {hits.map((h) => (
            <Pressable
              key={h.id}
              testID={`song-hit-${h.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${h.title}, ${h.artist}`}
              disabled={!!busy}
              onPress={() => choose(h)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Cover uri={h.image_url} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {h.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {[h.artist, h.album].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {busy === h.id ? <Spinner size={18} /> : <Ionicons name="add-circle-outline" size={20} color={colors.primary} />}
            </Pressable>
          ))}
          <Text style={[text.small, { textAlign: 'center' }]}>{t('favorites.orPaste')}</Text>
          <View style={styles.linkRow}>
            <TextInput
              testID="song-link"
              value={link}
              onChangeText={setLink}
              placeholder="https://open.spotify.com/track/…"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              onSubmitEditing={fromLink}
              style={styles.linkInput}
            />
            <Button testID="song-link-go" title={t('reviews.useLink')} size="sm" onPress={fromLink} loading={busy === 'link'} disabled={!link.trim() || !!busy} style={{ alignSelf: 'auto' }} />
          </View>
        </View>
      )}

      <ErrorText>{error}</ErrorText>
      <Button testID="save-favorites" title={t('favorites.save')} onPress={save} loading={busy === 'save'} disabled={!draft || !!busy} />
    </Screen>
  );
}

function Cover({ uri }: { uri: string | null }) {
  return uri ? (
    <Image source={{ uri }} style={styles.cover} contentFit="cover" />
  ) : (
    <View style={[styles.cover, styles.coverEmpty]}>
      <Ionicons name="musical-note" size={18} color={colors.muted} />
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.iconButton, webTouch(6), disabled && { opacity: 0.3 }]}
    >
      <Ionicons name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  slot: { width: 16, textAlign: 'center', fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  cover: { width: 44, height: 44, borderRadius: 4, backgroundColor: colors.card },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  iconButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.handle, borderRadius: 10, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs },
  linkInput: { flex: 1, minHeight: 36, color: colors.text, fontFamily: fonts.regular, fontSize: 13, outlineWidth: 0 },
});
