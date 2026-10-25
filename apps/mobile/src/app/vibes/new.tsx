import { extractFirstUrl, parseStreamingUrl } from '@soundhora/core';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type HostInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ErrorText, keyboardBehavior } from '../../components/ui';
import { VIBE_BACKGROUND } from '../../components/vibes/colors';
import { VibeContent, type VibeMusic } from '../../components/vibes/VibeContent';
import { defaultTextLook } from '../../components/vibes/textStyle';
import { VibeEditTools, VibeIconButton, VibeTextEditor, type EditorItem, type ToolPanel } from '../../components/vibes/VibeText';
import { createVibe, previewLink, uploadVibeMedia, VIBE_MAX_TEXTS, VIBE_VIDEO_MAX, type VibeKind, type VibeStyle, type VibeTextItem } from '../../lib/api';
import { AppError, formatError } from '../../lib/errors';
import { convertVibePhoto } from '../../lib/image-convert';
import { colors, fonts, space } from '../../theme';
import { webTouch } from '../../lib/touch';
import { canCreateVibes } from '../../lib/vibes-create';
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
  // Na web só dá para ver vibes: quem abrir o endereço de criar volta para o início.
  if (!canCreateVibes) return <Redirect href="/" />;
  return <NewVibeForm />;
}

function NewVibeForm() {
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
          ? {
              url: params.postUrl,
              platform: params.postPlatform ?? '',
              title: params.postTitle ?? '',
              artist: params.postArtist || null,
              imageUrl: params.postImage || null,
            }
          : null,
      }
    : null;

  const [kind, setKind] = useState<VibeKind>(sharedPost ? 'post' : 'text');
  const [media, setMedia] = useState<Media | null>(null);
  // Textos na tela (até 8): cada um com lugar, fonte, cor e fundo. editingId = o que está sendo digitado.
  const [items, setItems] = useState<EditorItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Fonte, cor e fundo do próximo texto: o último que a pessoa escolheu (como no Instagram).
  const [look, setLook] = useState<Pick<VibeTextItem, 'f' | 'c' | 'b'> | null>(null);
  const [panel, setPanel] = useState<ToolPanel>(null);
  const nextId = useRef(0);
  const editing = editingId !== null;
  const editingItem = items.find((i) => i.id === editingId) ?? null;
  const hasText = items.some((i) => i.t.trim());
  const canvasRef = useRef<HostInstance>(null);
  const [style, setStyle] = useState<VibeStyle>('violet');
  const [link, setLink] = useState('');
  const [music, setMusic] = useState<(VibeMusic & { id: string }) | null>(null);
  // Link da música digitado/colado direto na vibe (como o texto); tocar no card abre de novo.
  const [linkEditing, setLinkEditing] = useState(false);
  const [musicRect, setMusicRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState<null | 'preview' | 'publish'>(null);
  const [error, setError] = useState<string | null>(null);

  // Prévia em 9:16, cabendo na tela com espaço para a barra de cima e a de baixo (Figma: Vibes).
  const cardWidth = Math.min(width - 22, ((height - insets.top - insets.bottom - 190) * 9) / 16, 420);
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
      setMusic({ id: p.id, url: p.url, platform: p.platform, title: p.title, artist: p.artist, imageUrl: p.image_url });
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
    setEditingId(null);
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
    (kind === 'text' && hasText) || ((kind === 'photo' || kind === 'video') && !!media) || (kind === 'music' && !!music) || (kind === 'post' && !!sharedPost);

  const publish = async () => {
    setError(null);
    setBusy('publish');
    const textItems: VibeTextItem[] = items.filter((i) => i.t.trim()).map(({ id: _id, ...rest }) => rest);
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
        await createVibe({ kind: media.type, mediaPath: uploaded.path, durationMs: uploaded.durationMs, textItems });
      } else if (kind === 'music' && music) {
        await createVibe({ kind: 'music', linkPreviewId: music.id, style, textItems });
      } else if (kind === 'post' && sharedPost) {
        await createVibe({ kind: 'post', postId: sharedPost.id, style, textItems });
      } else {
        await createVibe({ kind: 'text', style, textItems });
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

  /** Termina de digitar: o texto que ficou vazio some. */
  function finishEditing() {
    setEditingId(null);
    setItems((prev) => prev.filter((i) => i.t.trim()));
    Keyboard.dismiss();
  }

  /** Novo texto onde a pessoa tocou (com a última fonte, cor e fundo usados). */
  function addTextAt(x: number, y: number) {
    if (items.length >= VIBE_MAX_TEXTS) return setError(t('vibes.maxTexts', { max: VIBE_MAX_TEXTS }));
    const id = `t${++nextId.current}`;
    setItems((prev) => [...prev, { id, t: '', x, y, ...(look ?? defaultTextLook(kind)) }]);
    setEditingId(id);
  }

  const changeItem = (id: string, patch: Partial<VibeTextItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  // Com um texto sendo editado, fonte/cor/fundo mudam só ele; sem texto, mudam o do próximo.
  const currentLook = editingItem ?? look ?? defaultTextLook(kind);
  const changeLook = (patch: Partial<Pick<VibeTextItem, 'f' | 'c' | 'b'>>) => {
    if (editingItem) changeItem(editingItem.id, patch);
    setLook({ f: currentLook.f, c: currentLook.c, b: currentLook.b, ...patch });
  };
  const deleteEditing = () => {
    if (!editingId) return;
    setItems((prev) => prev.filter((i) => i.id !== editingId));
    setEditingId(null);
    Keyboard.dismiss();
  };

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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Pressable
            testID="vibe-close"
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={12}
            style={webTouch(12)}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('vibes.new')}</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          {kind === 'music' && !music ? (
            <Pressable
              testID="vibe-music-empty"
              accessibilityRole="button"
              onPress={openLinkEditor}
              style={[styles.placeholder, { backgroundColor: VIBE_BACKGROUND[style] }]}
            >
              <Ionicons name="musical-notes" size={48} color={colors.text} />
              {!linkEditing ? <Text style={styles.placeholderText}>{t('vibes.musicHint')}</Text> : null}
            </Pressable>
          ) : (kind === 'photo' || kind === 'video') && !media ? (
            <View style={[styles.placeholder, { backgroundColor: '#000' }]}>
              <Ionicons name="images" size={48} color={colors.text} />
            </View>
          ) : (
            <>
              {kind === 'text' && !hasText && !editing ? (
                <View style={[styles.placeholder, { backgroundColor: VIBE_BACKGROUND[style] }]}>
                  <Ionicons name="text" size={40} color={colors.text} />
                  <Text style={styles.placeholderText}>{t('vibes.textHint')}</Text>
                </View>
              ) : (
                <VibeContent kind={kind} mediaUri={media?.uri} style={style} music={music} post={sharedPost} preview onMusicLayout={setMusicRect} />
              )}
              {/* Tocar num lugar vazio da vibe cria um texto novo ali; tocar num texto edita só ele. */}
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
                    if (
                      kind === 'music' &&
                      musicRect &&
                      x >= musicRect.x &&
                      x <= musicRect.x + musicRect.width &&
                      y >= musicRect.y &&
                      y <= musicRect.y + musicRect.height
                    ) {
                      return openLinkEditor();
                    }
                    addTextAt(Math.min(1, Math.max(0, x / cardWidth)), Math.min(1, Math.max(0, y / cardHeight)));
                  };
                  // Celular: posição do toque dentro da vibe. Web: nem sempre vem; calcula pela página.
                  if (Number.isFinite(locationX) && Number.isFinite(locationY) && (locationX || locationY)) apply(locationX, locationY);
                  else canvasRef.current?.measureInWindow((left, top) => apply(pageX - left, pageY - top));
                }}
              />
              <VibeTextEditor
                kind={kind}
                items={items}
                editingId={editingId}
                placeholder={kind === 'text' ? t('vibes.textPlaceholder') : t('vibes.captionPlaceholder')}
                onChangeText={(id, value) => changeItem(id, { t: value })}
                onChangePos={(id, pos) => changeItem(id, pos)}
                onStartEdit={setEditingId}
              />
              {canWrite || editing ? (
                <VibeEditTools
                  look={currentLook}
                  editing={editing}
                  panel={panel}
                  onPanel={setPanel}
                  onChange={changeLook}
                  onDelete={deleteEditing}
                  onDone={finishEditing}
                  background={showStyles ? { value: style, onChange: setStyle } : undefined}
                />
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

        {canWrite && !editing ? <Text style={styles.hint}>{hasText ? t('vibes.dragHint') : t('vibes.tapToWrite')}</Text> : null}

        <ErrorText>{error}</ErrorText>
        {/* Figma: avisos das 24 h acima da barra; embaixo, texto, imagem e música à esquerda e Publicar à direita. */}
        <Text style={styles.expires}>{t('vibes.expiresHint')}</Text>
        <View style={[styles.bottom, { width: cardWidth }]}>
          {!sharedPost ? (
            <View style={styles.modes}>
              <VibeIconButton testID="vibe-mode-text" icon="disc41" label={t('vibes.text')} active={kind === 'text'} onPress={() => switchTo('text')}>
                <Text style={styles.aaBottom}>Aa</Text>
              </VibeIconButton>
              <VibeIconButton
                testID="vibe-mode-library"
                icon="image"
                label={t('vibes.library')}
                active={kind === 'photo' || kind === 'video'}
                onPress={() => pick('library')}
              />
              <VibeIconButton testID="vibe-mode-music" icon="music" label={t('vibes.music')} active={kind === 'music'} onPress={() => switchTo('music')} />
              {Platform.OS !== 'web' ? (
                <Pressable
                  testID="vibe-mode-camera"
                  accessibilityRole="button"
                  accessibilityLabel={t('vibes.camera')}
                  onPress={() => pick('camera')}
                  hitSlop={6}
                  style={styles.camera}
                >
                  <Ionicons name="camera-outline" size={20} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View />
          )}
          <Pressable
            testID="vibe-publish"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPublish || !!busy, busy: busy === 'publish' }}
            disabled={!canPublish || !!busy}
            onPress={publish}
            style={[styles.publish, (!canPublish || !!busy) && { opacity: 0.5 }]}
          >
            <Text style={styles.publishText}>{busy === 'publish' ? t('common.loading') : t('vibes.publish')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  // Figma: cartão de 10 px de raio com borda fina.
  card: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: '#5A5577' },
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
  linkInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: 10,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    outlineWidth: 0,
  },
  linkStatus: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  linkButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.md },
  linkButton: { paddingVertical: 4, paddingHorizontal: space.sm },
  linkButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
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
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modes: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aaBottom: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  camera: { width: 41, height: 41, borderRadius: 21, backgroundColor: '#6C62FF', alignItems: 'center', justifyContent: 'center' },
  publish: { backgroundColor: '#6C62FF', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  publishText: { fontFamily: fonts.bold, fontSize: 12, color: '#FFFFFF' },
  expires: { fontFamily: fonts.regular, fontSize: 8, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
