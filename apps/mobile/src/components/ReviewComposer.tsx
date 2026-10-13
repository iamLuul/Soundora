import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AlbumCard, createReview, REVIEW_BODY } from '../lib/api';
import { formatError } from '../lib/errors';
import { reviewKeys } from '../lib/reviews';
import { webTouch } from '../lib/touch';
import { colors, fonts, space } from '../theme';
import { AlbumPicker } from './AlbumPicker';
import { StarRatingInput } from './StarRating';
import { Button, ErrorText, KeyboardView } from './ui';

/**
 * Postar › Review: escolher o álbum (obrigatório), dar a nota (0 a 10 nas 5 estrelas) e
 * escrever a análise. Publicada, vai para Músicas › Reviews.
 */
export function ReviewComposer({ onPublished }: { onPublished: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [album, setAlbum] = useState<AlbumCard | null>(null);
  // Sem nota até a pessoa escolher (0 também é nota).
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const length = body.trim().length;
  const canPublish = !!album && rating !== null && length >= REVIEW_BODY.min && length <= REVIEW_BODY.max;

  const publish = async () => {
    if (!album || rating === null) return;
    setError(null);
    setPublishing(true);
    try {
      await createReview({ albumId: album.id, rating, body });
      setAlbum(null);
      setRating(null);
      setBody('');
      await qc.invalidateQueries({ queryKey: reviewKeys.all });
      void qc.invalidateQueries({ queryKey: ['top-albums'] });
      void qc.invalidateQueries({ queryKey: ['album-summary'] });
      onPublished();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <View style={styles.top}>
        <Text style={styles.title}>{t('reviews.label')}</Text>
        <Button
          testID="publish-review"
          title={publishing ? t('reviews.publishing') : t('compose.publish')}
          size="sm"
          onPress={publish}
          loading={publishing}
          disabled={!canPublish || publishing}
          style={{ alignSelf: 'center' }}
        />
      </View>
      <KeyboardView>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {album ? (
            <View testID="review-album" style={styles.album}>
              {album.image_url ? (
                <Image source={{ uri: album.image_url }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverEmpty]}>
                  <Ionicons name="disc-outline" size={28} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.albumTitle} numberOfLines={2}>
                  {album.title}
                </Text>
                {album.artist ? <Text style={styles.artist}>{album.artist}</Text> : null}
                {album.release_year ? <Text style={styles.year}>{album.release_year}</Text> : null}
                <Pressable testID="change-album" accessibilityRole="button" onPress={() => setAlbum(null)} hitSlop={8} style={webTouch(8)}>
                  <Text style={styles.change}>{t('reviews.changeAlbum')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <AlbumPicker onPick={setAlbum} />
          )}

          {album ? (
            <>
              <View style={{ gap: space.sm }}>
                <Text style={styles.section}>{t('reviews.yourRating')}</Text>
                <StarRatingInput value={rating ?? 0} onChange={setRating} />
              </View>
              <View>
                <TextInput
                  testID="review-body"
                  value={body}
                  onChangeText={setBody}
                  placeholder={t('reviews.bodyPlaceholder')}
                  placeholderTextColor={colors.placeholder}
                  multiline
                  maxLength={REVIEW_BODY.max}
                  style={styles.body}
                  accessibilityLabel={t('reviews.bodyLabel')}
                />
                <Text style={[styles.counter, length > 0 && length < REVIEW_BODY.min && { color: colors.warning }]}>
                  {length < REVIEW_BODY.min ? t('reviews.minChars', { min: REVIEW_BODY.min, count: length }) : `${body.length}/${REVIEW_BODY.max}`}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.need}>{t('reviews.needAlbum')}</Text>
          )}
          <ErrorText>{error}</ErrorText>
        </ScrollView>
      </KeyboardView>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.tabBar,
  },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  content: { padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 120 },
  album: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  cover: { width: 96, height: 96, borderRadius: 4, backgroundColor: colors.card },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  artist: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  year: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  change: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primary, marginTop: space.xs },
  section: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, textAlign: 'center' },
  body: {
    minHeight: 180,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
    outlineWidth: 0,
    borderWidth: 1,
    borderColor: colors.tabBar,
    borderRadius: 10,
    padding: space.md,
  },
  counter: { alignSelf: 'flex-end', fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: space.xs },
  need: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
