import Ionicons from '@expo/vector-icons/Ionicons';
import { extractFirstUrl, parseStreamingUrl } from '@soundhora/core';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type AlbumCard, type AlbumHit, pickAlbum, previewLink, searchAlbums } from '../lib/api';
import { AppError, formatError } from '../lib/errors';
import { useDebouncedValue } from '../lib/hooks';
import { colors, fonts, space } from '../theme';
import { SearchField } from './figma';
import { Spinner } from './Spinner';

/**
 * Escolher o álbum da review, num campo só: digitar busca pelo nome do álbum ou do artista
 * (Deezer, pelo servidor); colar o link de um álbum (Spotify, Apple Music, Deezer…) mostra
 * esse álbum como resultado. Só álbum: link de música solta não vale.
 */
export function AlbumPicker({ onPick }: { onPick: (album: AlbumCard) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 400);
  // Com link no texto, o campo vira "colar link": não busca pelo nome.
  const url = extractFirstUrl(q);
  const parsed = url ? parseStreamingUrl(url) : null;
  // Link curto ("unknown") só se sabe o tipo no servidor.
  const linkOk = !!parsed && (parsed.kind === 'album' || parsed.kind === 'unknown');
  const results = useQuery({ queryKey: ['album-search', q], queryFn: () => searchAlbums(q), enabled: !url && q.length >= 2, staleTime: 5 * 60_000 });
  const fromLink = useQuery({
    queryKey: ['album-link', url],
    queryFn: async () => {
      const p = await previewLink(url!);
      if (p.kind !== 'album') throw new AppError('not_album');
      return { id: p.id, title: p.title, artist: p.artist, image_url: p.image_url, release_year: null } satisfies AlbumCard;
    },
    enabled: linkOk,
    staleTime: 5 * 60_000,
  });
  const [choosing, setChoosing] = useState<string | null>(null);
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

  // Link que não é de álbum (ou nem é de streaming): avisa na hora.
  const linkError = url && !linkOk ? formatError(t, new AppError('not_album')) : fromLink.isError ? formatError(t, fromLink.error) : null;
  const list = url ? [] : (results.data ?? []);
  const loading = url ? fromLink.isFetching : results.isFetching && !list.length;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.title}>{t('reviews.pickAlbum')}</Text>
      <SearchField
        testID="album-search"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setError(null);
        }}
        placeholder={t('reviews.searchAlbum')}
        inputMode="search"
      />
      <Text style={styles.help}>{t('reviews.searchOrPaste')}</Text>
      {loading ? <Spinner /> : null}
      {!url && q.length >= 2 && results.isSuccess && !list.length ? <Text style={styles.hint}>{t('reviews.noAlbums', { query: q })}</Text> : null}

      {fromLink.data ? (
        <AlbumRow
          testID="album-link-hit"
          title={fromLink.data.title}
          subtitle={[fromLink.data.artist, t('reviews.fromLink')].filter(Boolean).join(' · ')}
          image={fromLink.data.image_url}
          busy={false}
          disabled={!!choosing}
          onPress={() => onPick(fromLink.data!)}
        />
      ) : null}

      {list.length ? (
        <View style={{ gap: space.xs }}>
          {list.map((a) => (
            <AlbumRow
              key={a.id}
              testID={`album-hit-${a.id}`}
              title={a.title}
              subtitle={`${a.artist}${a.record_type ? ` · ${t(`reviews.recordType_${a.record_type}`, { defaultValue: a.record_type })}` : ''}`}
              image={a.image_url}
              busy={choosing === a.id}
              disabled={!!choosing}
              onPress={() => choose(a)}
            />
          ))}
        </View>
      ) : null}
      {(error ?? linkError) ? <Text style={styles.error}>{error ?? linkError}</Text> : null}
    </View>
  );
}

function AlbumRow({
  testID,
  title,
  subtitle,
  image,
  busy,
  disabled,
  onPress,
}: {
  testID: string;
  title: string;
  subtitle: string;
  image: string | null;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, pressed && { opacity: 0.7 }]}
    >
      {image ? (
        <Image source={{ uri: image }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Ionicons name="disc-outline" size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.hitTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.hitArtist} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {busy ? <Spinner size={18} /> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted, paddingHorizontal: space.xs },
  hit: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  cover: { width: 48, height: 48, borderRadius: 4, backgroundColor: colors.card },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  hitTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  hitArtist: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger, textAlign: 'center' },
});
