import { extractFirstUrl, parseStreamingUrl } from '@soundora/core';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorText } from '../../components/ui';
import { VIBE_BACKGROUND } from '../../components/vibes/colors';
import { VibeContent, type VibeMusic } from '../../components/vibes/VibeContent';
import {
  createVibe,
  previewLink,
  uploadVibeMedia,
  VIBE_STYLES,
  VIBE_VIDEO_MAX,
  type VibeKind,
  type VibeStyle,
} from '../../lib/api';
import { AppError, formatError } from '../../lib/errors';
import { convertVibePhoto } from '../../lib/image-convert';
import { colors, fonts, space } from '../../theme';

interface Media {
  type: 'photo' | 'video';
  uri: string;
  width: number;
  height: number;
  durationMs: number | null;
  fileSize: number | null;
}

type Params = {
  postId?: string;
  postUser?: string;
  postAvatar?: string;
  postBody?: string;
  postUrl?: string;
  postPlatform?: string;
  postTitle?: string;
  postArtist?: string;
  postImage?: string;
};

/**
 * Criar uma vibe: foto ou vídeo (galeria ou câmera), texto, card de música, ou um post
 * compartilhado (quando chega com ?postId=). Some em 24 horas.
 */
export default function NewVibeScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const qc = useQueryClient();

  const sharedPost = params.postId
    ? {
        id: params.postId,
        username: params.postUser ?? '',
        avatarUrl: params.postAvatar || null,
        body: params.postBody || null,
        music: params.postUrl
          ? { url: params.postUrl, platform: params.postPlatform ?? '', title: params.postTitle ?? '', artist: params.postArtist || null, imageUrl: params.postImage || null }
          : null,
      }
    : null;

  const [kind, setKind] = useState<VibeKind>(sharedPost ? 'post' : 'text');
  const [media, setMedia] = useState<Media | null>(null);
  const [text, setText] = useState('');
  const [style, setStyle] = useState<VibeStyle>('violet');
  const [link, setLink] = useState('');
  const [music, setMusic] = useState<(VibeMusic & { id: string }) | null>(null);
  const [busy, setBusy] = useState<null | 'preview' | 'publish'>(null);
  const [error, setError] = useState<string | null>(null);

  // Prévia em 9:16, cabendo na tela com espaço para os controles.
  const cardWidth = Math.min(width - space.lg * 2, ((height - insets.top - insets.bottom - 300) * 9) / 16, 420);
  const cardHeight = (cardWidth * 16) / 9;

  const pick = async (source: 'library' | 'camera') => {
    setError(null);
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images', 'videos'],
        videoMaxDuration: VIBE_VIDEO_MAX.seconds,
        quality: 1,
        // iOS: exporta o vídeo em H.264 de tamanho médio (arquivo menor).
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      };
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setError(t('vibes.cameraDenied'));
      }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      const isVideo = asset.type === 'video';
      setMedia({
        type: isVideo ? 'video' : 'photo',
        uri: asset.uri,
        width: asset.width ?? 0,
        height: asset.height ?? 0,
        durationMs: asset.duration ?? null,
        fileSize: asset.fileSize ?? null,
      });
      setKind(isVideo ? 'video' : 'photo');
    } catch (err) {
      setError(formatError(t, err));
    }
  };

  const loadMusic = async () => {
    setError(null);
    const url = extractFirstUrl(link);
    if (!url || !parseStreamingUrl(url)) return setError(t('errors.unsupported'));
    setBusy('preview');
    try {
      const p = await previewLink(url);
      setMusic({ id: p.id, url: p.url, platform: p.platform, title: p.title, artist: p.artist, imageUrl: p.image_url });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const canPublish =
    (kind === 'text' && text.trim().length > 0) ||
    ((kind === 'photo' || kind === 'video') && !!media) ||
    (kind === 'music' && !!music) ||
    (kind === 'post' && !!sharedPost);

  const publish = async () => {
    setError(null);
    setBusy('publish');
    try {
      if ((kind === 'photo' || kind === 'video') && media) {
        let bytes: Uint8Array;
        if (media.type === 'photo') {
          bytes = await convertVibePhoto(media.uri, media.width, media.height);
        } else {
          // O servidor confere de novo; aqui só evita enviar 200 MB à toa.
          if (media.durationMs && media.durationMs > VIBE_VIDEO_MAX.seconds * 1000 + 500) throw new AppError('video_too_long');
          if (media.fileSize && media.fileSize > VIBE_VIDEO_MAX.bytes) throw new AppError('video_too_large');
          bytes = new Uint8Array(await (await fetch(media.uri)).arrayBuffer());
          if (bytes.byteLength > VIBE_VIDEO_MAX.bytes) throw new AppError('video_too_large');
        }
        const uploaded = await uploadVibeMedia(media.type, bytes);
        await createVibe({ kind: media.type, mediaPath: uploaded.path, durationMs: uploaded.durationMs, text });
      } else if (kind === 'music' && music) {
        await createVibe({ kind: 'music', linkPreviewId: music.id, text, style });
      } else if (kind === 'post' && sharedPost) {
        await createVibe({ kind: 'post', postId: sharedPost.id, text, style });
      } else {
        await createVibe({ kind: 'text', text, style });
      }
      await qc.invalidateQueries({ queryKey: ['vibes'] });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const switchTo = (next: VibeKind) => {
    setError(null);
    setKind(next);
    if (next !== 'photo' && next !== 'video') setMedia(null);
  };

  const showStyles = kind === 'text' || kind === 'music' || kind === 'post';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable testID="vibe-close" accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('vibes.new')}</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          {kind === 'music' && !music ? (
            <View style={[styles.placeholder, { backgroundColor: VIBE_BACKGROUND[style] }]}>
              <Ionicons name="musical-notes" size={48} color={colors.text} />
              <Text style={styles.placeholderText}>{t('vibes.musicHint')}</Text>
            </View>
          ) : (kind === 'photo' || kind === 'video') && !media ? (
            <View style={[styles.placeholder, { backgroundColor: '#000' }]}>
              <Ionicons name="images" size={48} color={colors.text} />
            </View>
          ) : kind === 'text' && !text.trim() ? (
            <View style={[styles.placeholder, { backgroundColor: VIBE_BACKGROUND[style] }]}>
              <Text style={styles.placeholderText}>{t('vibes.textHint')}</Text>
            </View>
          ) : (
            <VibeContent kind={kind} mediaUri={media?.uri} text={text} style={style} music={music} post={sharedPost} preview />
          )}
        </View>

        {kind === 'music' && !music ? (
          <View style={[styles.linkRow, { width: cardWidth }]}>
            <TextInput
              testID="vibe-link"
              value={link}
              onChangeText={setLink}
              placeholder={t('compose.linkPlaceholder')}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={loadMusic}
            />
            <Button testID="vibe-load-music" title={t('vibes.loadMusic')} size="sm" onPress={loadMusic} loading={busy === 'preview'} style={{ alignSelf: 'center' }} />
          </View>
        ) : null}

        <TextInput
          testID="vibe-text"
          value={text}
          onChangeText={setText}
          placeholder={kind === 'text' ? t('vibes.textPlaceholder') : t('vibes.captionPlaceholder')}
          placeholderTextColor={colors.placeholder}
          maxLength={300}
          multiline
          style={[styles.input, { width: cardWidth }]}
        />

        {showStyles ? (
          <View style={styles.dots} accessibilityRole="radiogroup" accessibilityLabel={t('vibes.background')}>
            {VIBE_STYLES.map((s) => (
              <Pressable
                key={s}
                testID={`vibe-style-${s}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: style === s }}
                accessibilityLabel={t(`vibes.style.${s}`)}
                onPress={() => setStyle(s)}
                style={[styles.dot, { backgroundColor: VIBE_BACKGROUND[s] }, style === s && styles.dotOn]}
              />
            ))}
          </View>
        ) : null}

        {!sharedPost ? (
          <View style={styles.modes}>
            <Mode testID="vibe-mode-library" icon="images-outline" label={t('vibes.library')} active={kind === 'photo' || kind === 'video'} onPress={() => pick('library')} />
            {Platform.OS !== 'web' ? <Mode testID="vibe-mode-camera" icon="camera-outline" label={t('vibes.camera')} onPress={() => pick('camera')} /> : null}
            <Mode testID="vibe-mode-text" icon="text-outline" label={t('vibes.text')} active={kind === 'text'} onPress={() => switchTo('text')} />
            <Mode testID="vibe-mode-music" icon="musical-notes-outline" label={t('vibes.music')} active={kind === 'music'} onPress={() => switchTo('music')} />
          </View>
        ) : null}

        <ErrorText>{error}</ErrorText>
        <Button testID="vibe-publish" title={t('vibes.publish')} onPress={publish} loading={busy === 'publish'} disabled={!canPublish || !!busy} style={{ width: cardWidth }} />
        <Text style={styles.hint}>{t('vibes.expiresHint')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Mode({ icon, label, onPress, active, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress} style={styles.mode}>
      <View style={[styles.modeIcon, active && { backgroundColor: colors.primary }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <Text style={styles.modeLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  placeholderText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, textAlign: 'center', opacity: 0.9 },
  linkRow: { flexDirection: 'row', gap: space.sm },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    outlineWidth: 0,
  },
  dots: { flexDirection: 'row', gap: space.md },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  dotOn: { borderColor: colors.text },
  modes: { flexDirection: 'row', gap: space.xl, marginTop: space.xs },
  mode: { alignItems: 'center', gap: 4 },
  modeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  modeLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
