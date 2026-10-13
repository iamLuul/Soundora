import Ionicons from '@expo/vector-icons/Ionicons';
import { extractFirstUrl, parseStreamingUrl } from '@soundora/core';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AlbumCard, type AlbumHit, pickAlbum, previewLink, searchAlbums } from '../lib/api';
import { AppError, formatError } from '../lib/errors';
import { useDebouncedValue } from '../lib/hooks';
import { colors, fonts, space } from '../theme';
import { SearchField } from './figma';
import { Spinner } from './Spinner';
import { Button } from './ui';

/**
 * Escolher o álbum da review: busca pelo nome ou artista (Deezer, pelo servidor) ou colar o
 * link de um álbum (Spotify, Apple Music, Deezer…). Só álbum: link de música solta não vale.
 */
export function AlbumPicker({ onPick }: { onPick: (album: AlbumCard) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 400);
  const results = useQuery({ queryKey: ['album-search', q], queryFn: () => searchAlbums(q), enabled: q.length >= 2, staleTime: 5 * 60_000 });
  const [choosing, setChoosing] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const choose = async (hit: AlbumHit) => {
    setError(null);
    setChoosing(hit.id);
    try {
      onPick(await pickAlbum(hit.id));
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setChoosing(null);
    }
  };

  const fromLink = async () => {
    setError(null);
    const url = extractFirstUrl(link);
    const parsed = url ? parseStreamingUrl(url) : null;
    // Link curto ("unknown") só se sabe o tipo no servidor.
    if (!url || !parsed || (parsed.kind !== 'album' && parsed.kind !== 'unknown')) return setError(formatError(t, new AppError('not_album')));
    setChoosing('link');
    try {
      const p = await previewLink(url);
      if (p.kind !== 'album') throw new AppError('not_album');
      onPick({ id: p.id, title: p.title, artist: p.artist, image_url: p.image_url, release_year: null });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setChoosing(null);
    }
  };

  const list = results.data ?? [];
  return (
    <View style={{ gap: space.md }}>
      <Text style={styles.title}>{t('reviews.pickAlbum')}</Text>
      <SearchField testID="album-search" value={query} onChangeText={setQuery} placeholder={t('reviews.searchAlbum')} />
      {results.isFetching && !list.length ? <Spinner /> : null}
      {q.length >= 2 && results.isSuccess && !list.length ? <Text style={styles.hint}>{t('reviews.noAlbums', { query: q })}</Text> : null}
      {list.length ? (
        <View style={{ gap: space.xs }}>
          {list.map((a) => (
            <Pressable
              key={a.id}
              testID={`album-hit-${a.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${a.title}, ${a.artist}`}
              disabled={!!choosing}
              onPress={() => choose(a)}
              style={({ pressed }) => [styles.hit, pressed && { opacity: 0.7 }]}
            >
              {a.image_url ? (
                <Image source={{ uri: a.image_url }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverEmpty]}>
                  <Ionicons name="disc-outline" size={22} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.hitTitle} numberOfLines={1}>
                  {a.title}
                </Text>
                <Text style={styles.hitArtist} numberOfLines={1}>
                  {a.artist}
                  {a.record_type ? ` · ${t(`reviews.recordType_${a.record_type}`, { defaultValue: a.record_type })}` : ''}
                </Text>
              </View>
              {choosing === a.id ? <Spinner size={18} /> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.hint}>{t('reviews.orPaste')}</Text>
      <View style={styles.linkRow}>
        <TextInput
          testID="album-link"
          accessibilityLabel={t('a11y.albumLink')}
          value={link}
          onChangeText={setLink}
          placeholder="https://open.spotify.com/album/…"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onSubmitEditing={fromLink}
          style={styles.linkInput}
        />
        <Button
          testID="album-link-go"
          title={t('reviews.useLink')}
          size="sm"
          onPress={fromLink}
          loading={choosing === 'link'}
          disabled={!link.trim() || !!choosing}
          style={{ alignSelf: 'auto' }}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  cover: { width: 48, height: 48, borderRadius: 4, backgroundColor: colors.card },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  hitTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  hitArtist: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.handle, borderRadius: 10, paddingLeft: space.md, paddingRight: space.xs, paddingVertical: space.xs },
  linkInput: { flex: 1, minHeight: 36, color: colors.text, fontFamily: fonts.regular, fontSize: 13, outlineWidth: 0 },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger, textAlign: 'center' },
});
