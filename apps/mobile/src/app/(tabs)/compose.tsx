import { POST_TEXT_MAX, extractFirstUrl, parseStreamingUrl } from '@soundora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { MusicCard } from '../../components/MusicCard';
import { Button, Chip, ErrorText, Screen, TextField } from '../../components/ui';
import { createPost, getMyGenres, previewLink } from '../../lib/api';
import { errorMessageKey } from '../../lib/errors';
import { keys } from '../../lib/queries';
import type { LinkPreviewRow } from '../../lib/types';
import { space, text } from '../../theme';

export default function ComposeScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState<LinkPreviewRow | null>(null);
  const [body, setBody] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const myGenres = useQuery({ queryKey: ['my-genres'], queryFn: getMyGenres });

  const loadPreview = async (value = link) => {
    setError(null);
    setPreview(null);
    const url = extractFirstUrl(value);
    // Confere no app antes de chamar o servidor: resposta instantânea para links errados.
    if (!url || !parseStreamingUrl(url)) return setError(t('errors.unsupported'));
    setLoadingPreview(true);
    try {
      setPreview(await previewLink(url));
    } catch (err) {
      setError(t(errorMessageKey(err)));
    } finally {
      setLoadingPreview(false);
    }
  };

  const paste = async () => {
    const value = await Clipboard.getStringAsync();
    setLink(value);
    if (value) await loadPreview(value);
  };

  const publish = async () => {
    if (!preview) return;
    setPublishing(true);
    setError(null);
    try {
      await createPost({ previewId: preview.id, body, genre });
      setLink('');
      setPreview(null);
      setBody('');
      setGenre(null);
      await qc.invalidateQueries({ queryKey: keys.feed });
      router.navigate('/');
    } catch (err) {
      setError(t(errorMessageKey(err)));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <Text style={text.title}>{t('compose.title')}</Text>

      <View style={styles.linkRow}>
        <View style={{ flex: 1 }}>
          <TextField
            testID="link-input"
            label={t('compose.linkLabel')}
            placeholder={t('compose.linkPlaceholder')}
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            onSubmitEditing={() => loadPreview()}
          />
        </View>
        <View style={{ justifyContent: 'flex-end' }}>
          <Button title={t('compose.paste')} variant="ghost" onPress={paste} />
        </View>
      </View>

      {!preview ? (
        <Button testID="load-preview" title={t('compose.preview')} onPress={() => loadPreview()} loading={loadingPreview} disabled={!link.trim()} />
      ) : (
        <>
          <MusicCard data={{ url: preview.url, platform: preview.platform, title: preview.title, artist: preview.artist, imageUrl: preview.image_url }} />
          <TextField
            testID="post-body"
            label={t('compose.textLabel')}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={POST_TEXT_MAX}
            style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: space.md }}
            hint={`${body.length}/${POST_TEXT_MAX}`}
          />
          {myGenres.data?.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={text.label}>{t('compose.genreLabel')}</Text>
              <View style={styles.chips}>
                {myGenres.data.map((g) => (
                  <Chip key={g} label={g.replace(/_/g, ' ')} selected={genre === g} onPress={() => setGenre(genre === g ? null : g)} />
                ))}
              </View>
            </View>
          ) : null}
          <Button testID="publish" title={t('compose.publish')} onPress={publish} loading={publishing} />
        </>
      )}

      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 640, width: '100%', alignSelf: 'center' },
  linkRow: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
