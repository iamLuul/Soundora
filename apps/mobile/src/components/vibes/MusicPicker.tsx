import Ionicons from '@expo/vector-icons/Ionicons';
import { extractFirstUrl, parseStreamingUrl } from '@soundhora/core';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickSong, previewLink, searchSongs, type SongHit } from '../../lib/api';
import { AppError, formatError } from '../../lib/errors';
import { useDebouncedValue } from '../../lib/hooks';
import { colors, fonts, space } from '../../theme';
import { SearchField } from '../figma';
import { Spinner } from '../Spinner';
import type { VibeMusic } from './VibeContent';

/** Música escolhida para a vibe: o cartão guardado no servidor (id) e o que aparece. */
export type PickedMusic = VibeMusic & { id: string };

/**
 * Escolher a música da vibe, como a figurinha de música do Story: um campo só para buscar pelo
 * nome da música ou do artista (Deezer, pelo servidor) ou colar o link de qualquer plataforma.
 */
export function MusicPicker({ visible, onPick, onClose }: { visible: boolean; onPick: (m: PickedMusic) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const url = extractFirstUrl(q);
  const results = useQuery({ queryKey: ['song-search', q], queryFn: () => searchSongs(q), enabled: visible && !url && q.length >= 2, staleTime: 5 * 60_000 });
  const fromLink = useQuery({
    queryKey: ['vibe-music-link', url],
    queryFn: async () => {
      if (!url || !parseStreamingUrl(url)) throw new AppError('unsupported');
      const p = await previewLink(url);
      return { id: p.id, url: p.url, platform: p.platform, title: p.title, artist: p.artist, imageUrl: p.image_url } satisfies PickedMusic;
    },
    enabled: visible && !!url,
    staleTime: 5 * 60_000,
  });
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setQuery('');
    setError(null);
    onClose();
  };
  const choose = async (hit: SongHit) => {
    setError(null);
    setChoosing(hit.id);
    try {
      const s = await pickSong(hit.id);
      onPick({ id: s.link_preview_id, url: s.url, platform: s.platform, title: s.title, artist: s.artist, imageUrl: s.image_url });
      close();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setChoosing(null);
    }
  };

  const list = url ? [] : (results.data ?? []);
  const loading = url ? fromLink.isFetching : results.isFetching && !list.length;
  const shownError = error ?? (fromLink.isError ? formatError(t, fromLink.error) : results.isError ? formatError(t, results.error) : null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable testID="vibe-music-close" style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]} testID="vibe-music-picker">
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('vibes.music')}</Text>
        <SearchField testID="vibe-music-search" value={query} onChangeText={setQuery} placeholder={t('vibes.musicSearch')} autoFocus />
        {loading ? <Spinner style={{ marginTop: space.lg }} /> : null}
        {shownError ? <Text style={styles.error}>{shownError}</Text> : null}
        {fromLink.data ? (
          <Row testID="vibe-music-link-hit" title={fromLink.data.title} subtitle={fromLink.data.artist ?? ''} image={fromLink.data.imageUrl} busy={false} onPress={() => (onPick(fromLink.data!), close())} />
        ) : null}
        <FlatList
          data={list}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          style={{ flexGrow: 0, maxHeight: 360 }}
          ListEmptyComponent={
            !url && !loading ? (
              <Text style={styles.hint}>{q.length >= 2 && results.isSuccess ? t('vibes.musicNone', { query: q }) : t('vibes.musicEmpty')}</Text>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Row
              testID={`vibe-music-hit-${item.id}`}
              title={item.title}
              subtitle={item.artist}
              image={item.image_url}
              busy={choosing === item.id}
              onPress={() => (choosing ? undefined : void choose(item))}
            />
          )}
        />
      </View>
    </Modal>
  );
}

function Row({ testID, title, subtitle, image, busy, onPress }: { testID: string; title: string; subtitle: string; image: string | null; busy: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Ionicons name="musical-notes" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {busy ? <Spinner size={18} /> : <Ionicons name="add-circle-outline" size={22} color={colors.text} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: space.lg, gap: space.md, maxHeight: '80%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surface },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, textAlign: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  cover: { width: 48, height: 48, borderRadius: 6 },
  coverEmpty: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
