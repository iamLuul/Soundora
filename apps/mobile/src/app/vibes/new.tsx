import { extractFirstUrl, parseStreamingUrl } from '@soundora/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, ErrorText, keyboardBehavior } from '../../components/ui';
import { VIBE_BACKGROUND } from '../../components/vibes/colors';
import { VibeContent, type VibeMusic } from '../../components/vibes/VibeContent';
import { defaultTextPos, EditableVibeText, type TextPos } from '../../components/vibes/VibeText';
import { VibeAudio } from '../../components/vibes/VibeAudio';
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
import { webTouch } from '../../lib/touch';
import { CoachMarks, useFirstTimeTip } from '../../components/CoachMarks';

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
  // Primeira vez criando uma vibe: os tipos, escrever e arrastar, e as 24 horas.
  const [tipOpen, closeTip] = useFirstTimeTip('vibe-new');
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
  // Texto na tela: onde fica (fração da tela) e se está sendo digitado.
  const [textPos, setTextPos] = useState<TextPos | null>(null);
  const [editing, setEditing] = useState(false);
  const canvasRef = useRef<View>(null);
  const [style, setStyle] = useState<VibeStyle>('violet');
  const [link, setLink] = useState('');
  const [music, setMusic] = useState<(VibeMusic & { id: string }) | null>(null);
  // Link da música digitado/colado direto na vibe (como o texto); tocar no card abre de novo.
  const [linkEditing, setLinkEditing] = useState(false);
  const [musicRect, setMusicRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [muted, setMuted] = useState(false);
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

  /** Gera o card. Uma música por vibe: um link novo troca a anterior. */
  const loadMusic = async (value = link) => {
    setError(null);
    const url = extractFirstUrl(value);
    if (!url || !parseStreamingUrl(url)) return setError(t('errors.unsupported'));
    if (music && url === music.url) return setLinkEditing(false);
    setBusy('preview');
    try {
      const p = await previewLink(url);
      setMusic({ id: p.id, url: p.url, platform: p.platform, title: p.title, artist: p.artist, imageUrl: p.image_url, audioUrl: p.audio_url ?? null });
      setLinkEditing(false);
      Keyboard.dismiss();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  // Colou/digitou um link de música válido: gera o card sozinho.
  const lastTried = useRef<string | null>(null);
  useEffect(() => {
    if (!linkEditing) return;
    const url = extractFirstUrl(link);
    if (!url || url === lastTried.current || !parseStreamingUrl(url) || url === music?.url) return;
    const timer = setTimeout(() => {
      lastTried.current = url;
      void loadMusic(url);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMusic muda a cada render; o que importa é o link
  }, [link, linkEditing, music?.url]);

  const openLinkEditor = () => {
    setEditing(false);
    setError(null);
    setLink(music?.url ?? '');
    lastTried.current = music?.url ?? null;
    setLinkEditing(true);
  };

  const pasteLink = async () => {
    const value = await Clipboard.getStringAsync().catch(() => '');
    if (value) setLink(value);
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
        await createVibe({ kind: media.type, mediaPath: uploaded.path, durationMs: uploaded.durationMs, text, textPos });
      } else if (kind === 'music' && music) {
        await createVibe({ kind: 'music', linkPreviewId: music.id, text, style, textPos });
      } else if (kind === 'post' && sharedPost) {
        await createVibe({ kind: 'post', postId: sharedPost.id, text, style, textPos });
      } else {
        await createVibe({ kind: 'text', text, style, textPos });
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
    // Música: já abre o campo do link na própria vibe.
    setLinkEditing(next === 'music' && !music);
    if (next !== 'photo' && next !== 'video') setMedia(null);
  };

  const showStyles = kind === 'text' || kind === 'music' || kind === 'post';
  // Dá para escrever na tela quando já existe o fundo da vibe (texto, mídia, música ou post).
  const canWrite = kind === 'text' || kind === 'post' || (kind === 'music' && !!music) || ((kind === 'photo' || kind === 'video') && !!media);

  function finishEditing() {
    setEditing(false);
    Keyboard.dismiss();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={keyboardBehavior}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <CoachMarks
        testID="coach-vibe-new"
        visible={tipOpen}
        onClose={closeTip}
        steps={[
          { icon: 'images-outline', title: t('tips.vibeNewTypeTitle'), body: t('tips.vibeNewTypeBody') },
          { icon: 'text-outline', title: t('tips.vibeNewTextTitle'), body: t('tips.vibeNewTextBody') },
          { icon: 'time-outline', title: t('tips.vibeNewTimeTitle'), body: t('tips.vibeNewTimeBody') },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable testID="vibe-close" accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={webTouch(12)}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('vibes.new')}</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          {kind === 'music' && !music ? (
            <Pressable testID="vibe-music-empty" accessibilityRole="button" onPress={openLinkEditor} style={[styles.placeholder, { backgroundColor: VIBE_BACKGROUND[style] }]}>
              <Ionicons name="musical-notes" size={48} color={colors.text} />
              {!linkEditing ? <Text style={styles.placeholderText}>{t('vibes.musicHint')}</Text> : null}
            </Pressable>
          ) : (kind === 'photo' || kind === 'video') && !media ? (
            <View style={[styles.placeholder, { backgroundColor: '#000' }]}>
              <Ionicons name="images" size={48} color={colors.text} />
            </View>
          ) : (
            <>
              {kind === 'text' && !text.trim() && !editing ? (
                <View style={[styles.placeholder, { backgroundColor: VIBE_BACKGROUND[style] }]}>
                  <Ionicons name="text" size={40} color={colors.text} />
                  <Text style={styles.placeholderText}>{t('vibes.textHint')}</Text>
                </View>
              ) : (
                <VibeContent
                  kind={kind}
                  mediaUri={media?.uri}
                  text={null}
                  style={style}
                  music={music}
                  post={sharedPost}
                  preview
                  onMusicLayout={setMusicRect}
                />
              )}
              {/* Tocar na tela escreve ali (ou leva o texto para lá); arrastar o texto também move. */}
              <Pressable
                testID="vibe-canvas"
                accessibilityRole="button"
                accessibilityLabel={t('vibes.tapToWrite')}
                style={StyleSheet.absoluteFill}
                ref={canvasRef}
                onPress={(e) => {
                  if (editing) return finishEditing();
                  if (linkEditing) return music ? setLinkEditing(false) : undefined;
                  const { locationX, locationY, pageX, pageY } = e.nativeEvent;
                  const apply = (x: number, y: number) => {
                    // Tocou no card da música: edita o link (uma música por vibe).
                    if (kind === 'music' && musicRect && x >= musicRect.x && x <= musicRect.x + musicRect.width && y >= musicRect.y && y <= musicRect.y + musicRect.height) {
                      return openLinkEditor();
                    }
                    setTextPos({ x: Math.min(1, Math.max(0, x / cardWidth)), y: Math.min(1, Math.max(0, y / cardHeight)) });
                    if (!text.trim()) setEditing(true);
                  };
                  // Celular: posição do toque dentro da vibe. Web: nem sempre vem; calcula pela página.
                  if (Number.isFinite(locationX) && Number.isFinite(locationY) && (locationX || locationY)) apply(locationX, locationY);
                  else canvasRef.current?.measureInWindow((left, top) => apply(pageX - left, pageY - top));
                }}
              />
              <EditableVibeText
                kind={kind}
                text={text}
                pos={textPos ?? defaultTextPos(kind)}
                editing={editing}
                placeholder={kind === 'text' ? t('vibes.textPlaceholder') : t('vibes.captionPlaceholder')}
                onChangeText={setText}
                onChangePos={setTextPos}
                onStartEdit={() => setEditing(true)}
                onEndEdit={finishEditing}
              />
              {kind === 'music' && music?.audioUrl && !linkEditing ? (
                <>
                  <VibeAudio url={music.audioUrl} paused={busy === 'publish'} muted={muted} loop />
                  <Pressable
                    testID="vibe-mute"
                    accessibilityRole="button"
                    accessibilityLabel={muted ? t('vibes.unmute') : t('vibes.mute')}
                    onPress={() => setMuted((m) => !m)}
                    style={styles.mute}
                    hitSlop={8}
                  >
                    <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.text} />
                  </Pressable>
                </>
              ) : null}
              {editing ? (
                <Pressable testID="vibe-text-done" accessibilityRole="button" onPress={finishEditing} style={styles.done} hitSlop={8}>
                  <Text style={styles.doneText}>{t('vibes.done')}</Text>
                </Pressable>
              ) : null}
            </>
          )}
          {kind === 'music' && linkEditing ? (
            <View style={styles.linkEditor}>
              <Text style={styles.linkTitle}>{music ? t('vibes.changeMusic') : t('vibes.pasteMusic')}</Text>
              <TextInput
                testID="vibe-link"
                accessibilityLabel={t('a11y.musicLink')}
                value={link}
                onChangeText={setLink}
                placeholder={t('compose.linkPlaceholder')}
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                inputMode="url"
                onSubmitEditing={() => loadMusic()}
                style={styles.linkInput}
              />
              {busy === 'preview' ? <Text style={styles.linkStatus}>{t('compose.loadingMusic')}</Text> : null}
              <View style={styles.linkButtons}>
                {Platform.OS !== 'web' ? (
                  <Pressable testID="vibe-link-paste" accessibilityRole="button" onPress={pasteLink} style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>{t('compose.paste')}</Text>
                  </Pressable>
                ) : null}
                {music ? (
                  <Pressable testID="vibe-link-cancel" accessibilityRole="button" onPress={() => setLinkEditing(false)} style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>{t('common.cancel')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>


        {canWrite && !editing ? <Text style={styles.hint}>{text.trim() ? t('vibes.dragHint') : t('vibes.tapToWrite')}</Text> : null}

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
  linkEditor: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    top: '38%',
    backgroundColor: 'rgba(20,18,30,0.92)',
    borderRadius: 14,
    padding: space.lg,
    gap: space.sm,
  },
  linkTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  linkInput: { minHeight: 42, borderWidth: 1, borderColor: colors.field, borderRadius: 10, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.regular, fontSize: 13, outlineWidth: 0 },
  linkStatus: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  linkButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md },
  linkButton: { paddingVertical: 4, paddingHorizontal: space.sm },
  linkButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  mute: { position: 'absolute', top: space.md, left: space.md, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
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
  done: { position: 'absolute', top: space.md, right: space.md, backgroundColor: colors.text, borderRadius: 16, paddingHorizontal: space.md, paddingVertical: 6 },
  doneText: { fontFamily: fonts.bold, fontSize: 13, color: colors.background },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
