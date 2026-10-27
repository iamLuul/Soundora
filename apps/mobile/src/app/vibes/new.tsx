import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoachMarks, useFirstTimeTip } from '../../components/CoachMarks';
import { RingAvatar } from '../../components/figma';
import { Spinner } from '../../components/Spinner';
import { VIBE_BACKGROUND } from '../../components/vibes/colors';
import { TextComposer } from '../../components/vibes/TextComposer';
import { defaultTextLook } from '../../components/vibes/textStyle';
import { VibeCamera, type CapturedMedia } from '../../components/vibes/VibeCamera';
import { VibeContent } from '../../components/vibes/VibeContent';
import { DraggableText, type EditorItem, type TrashZone } from '../../components/vibes/VibeText';
import { createVibe, uploadVibeMedia, VIBE_MAX_TEXTS, VIBE_STYLES, VIBE_VIDEO_MAX, type VibeKind, type VibeStyle, type VibeTextItem } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { confirmAction } from '../../lib/dialogs';
import { AppError, formatError } from '../../lib/errors';
import { convertVibePhoto } from '../../lib/image-convert';
import { vibeCanvas } from '../../lib/vibe-canvas';
import { canCreateVibes } from '../../lib/vibes-create';
import { colors, fonts, space } from '../../theme';

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

/** O fundo da vibe: foto/vídeo, cor (texto) ou post compartilhado. */
type Background = { type: 'media'; media: CapturedMedia } | { type: 'color' } | { type: 'post' };

/**
 * Criar uma vibe, no jeito do Story:
 * 1. Câmera: tirar foto, segurar para gravar vídeo, abrir a galeria, ou criar só com texto (Aa).
 * 2. Edição: a vibe em tela cheia; à direita, texto (Aa) e cor do fundo; textos que se
 *    arrastam, aumentam e giram com dois dedos e somem na lixeira; embaixo, publicar.
 * Compartilhar um post (?postId=) já abre na edição, com o post.
 */
export default function NewVibeScreen() {
  // Na web só dá para ver vibes: quem abrir o endereço de criar volta para o início.
  if (!canCreateVibes) return <Redirect href="/" />;
  return <NewVibe />;
}

function NewVibe() {
  const { t } = useTranslation();
  const [tipOpen, closeTip] = useFirstTimeTip('vibe-new');
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canvas = vibeCanvas(window, insets);

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

  const [background, setBackground] = useState<Background | null>(sharedPost ? { type: 'post' } : null);
  const [style, setStyle] = useState<VibeStyle>('violet');
  const [items, setItems] = useState<EditorItem[]>([]);
  // Texto aberto para escrever: um que já existe (id) ou um novo ('new').
  const [composing, setComposing] = useState<string | null>(null);
  // Jeito do próximo texto: o último usado (como no Instagram).
  const [look, setLook] = useState<Pick<VibeTextItem, 'f' | 'c' | 'b' | 'a'> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const hasText = items.some((i) => i.t.trim());
  const kind: VibeKind = background?.type === 'media' ? background.media.type : background?.type === 'post' ? 'post' : 'text';
  const canPublish = !!background && (background.type !== 'color' || hasText);
  // Lixeira: no meio, perto do fim do cartão (coordenadas da janela, para o arrastar comparar).
  const trash: TrashZone = { x: canvas.left + canvas.width / 2, y: canvas.top + canvas.height - 64, r: 46 };

  /** Volta para a câmera (pergunta antes se já tem algo feito). */
  const discard = async () => {
    if (sharedPost) return close();
    if (items.length && !(await confirmAction(t('vibes.discardConfirm'), t('vibes.discard'), t('common.cancel')))) return;
    setBackground(null);
    setItems([]);
    setError(null);
  };

  const pickFromGallery = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        videoMaxDuration: VIBE_VIDEO_MAX.seconds,
        quality: 1,
        // iOS: exporta o vídeo em H.264 de tamanho médio (arquivo menor).
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      setBackground({
        type: 'media',
        media: {
          type: asset.type === 'video' ? 'video' : 'photo',
          uri: asset.uri,
          width: asset.width ?? 0,
          height: asset.height ?? 0,
          durationMs: asset.duration ?? null,
          fileSize: asset.fileSize ?? null,
        },
      });
    } catch (err) {
      setError(formatError(t, err));
    }
  };

  const openNewText = () => {
    if (items.length >= VIBE_MAX_TEXTS) return setError(t('vibes.maxTexts', { max: VIBE_MAX_TEXTS }));
    setError(null);
    setComposing('new');
  };

  const finishText = (item: VibeTextItem) => {
    const id = composing;
    setComposing(null);
    Keyboard.dismiss();
    setLook({ f: item.f, c: item.c, b: item.b, a: item.a });
    if (!item.t.trim()) {
      if (id && id !== 'new') setItems((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    if (id === 'new') setItems((prev) => [...prev, { ...item, id: `t${++nextId.current}` }]);
    else setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...item } : i)));
  };

  const changeItem = (id: string, patch: Partial<VibeTextItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const publish = async () => {
    if (!background || !canPublish) return;
    setError(null);
    setBusy(true);
    const textItems: VibeTextItem[] = items.filter((i) => i.t.trim()).map(({ id: _id, ...rest }) => rest);
    try {
      if (background.type === 'media') {
        const media = background.media;
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
      } else if (background.type === 'post' && sharedPost) {
        await createVibe({ kind: 'post', postId: sharedPost.id, style, textItems });
      } else {
        await createVibe({ kind: 'text', style, textItems });
      }
      await qc.invalidateQueries({ queryKey: ['vibes'] });
      close();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const composingItem = composing === 'new' ? null : items.find((i) => i.id === composing);
  const composerInitial: VibeTextItem | null = composing ? (composingItem ?? { t: '', x: 0.5, y: 0.42, ...(look ?? defaultTextLook(kind)) }) : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <CoachMarks
        testID="coach-vibe-new"
        visible={tipOpen}
        onClose={closeTip}
        steps={[
          { icon: 'camera-outline', title: t('tips.vibeNewTypeTitle'), body: t('tips.vibeNewTypeBody') },
          { icon: 'text-outline', title: t('tips.vibeNewTextTitle'), body: t('tips.vibeNewTextBody') },
          { icon: 'time-outline', title: t('tips.vibeNewTimeTitle'), body: t('tips.vibeNewTimeBody') },
        ]}
      />

      {!background ? (
        <View style={{ paddingTop: canvas.top, alignItems: 'center' }}>
          <VibeCamera
            width={canvas.width}
            height={canvas.height}
            onMedia={(media) => setBackground({ type: 'media', media })}
            onGallery={pickFromGallery}
            onText={() => {
              setBackground({ type: 'color' });
              openNewText();
            }}
            onClose={close}
          />
          <Text style={styles.modeLabel}>{t('vibes.modeLabel')}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : (
        <>
          <View
            style={[styles.canvas, { top: canvas.top, left: canvas.left, width: canvas.width, height: canvas.height }]}
            onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            <VibeContent kind={kind} mediaUri={background.type === 'media' ? background.media.uri : undefined} style={style} post={sharedPost} preview />
            {/* Tocar num lugar vazio escreve um texto novo (como tocar na tela do Story). */}
            <Pressable
              testID="vibe-canvas"
              accessibilityRole="button"
              accessibilityLabel={t('vibes.tapToWrite')}
              style={StyleSheet.absoluteFill}
              onPress={openNewText}
            />
            {kind === 'text' && !hasText && !composing ? (
              <View style={styles.emptyHint} pointerEvents="none">
                <Text style={styles.emptyHintText}>{t('vibes.textHint')}</Text>
              </View>
            ) : null}
            {items.map((item, i) => (
              <DraggableText
                key={item.id}
                index={i}
                item={item}
                kind={kind}
                box={box}
                trash={trash}
                onEdit={() => setComposing(item.id)}
                onChange={(patch) => changeItem(item.id, patch)}
                onDelete={() => removeItem(item.id)}
                onDragging={setDragging}
                onOverTrash={setOverTrash}
              />
            ))}

            {!dragging ? (
              <>
                <View style={styles.topRow} pointerEvents="box-none">
                  <RoundButton testID="vibe-discard" icon="close" label={sharedPost ? t('common.cancel') : t('vibes.discard')} onPress={discard} />
                  <View style={{ flex: 1 }} pointerEvents="none" />
                  <View style={styles.tools}>
                    <RoundButton testID="vibe-add-text" label={t('vibes.addText')} onPress={openNewText}>
                      <Text style={styles.aa}>Aa</Text>
                    </RoundButton>
                    {background.type !== 'media' ? (
                      <RoundButton
                        testID="vibe-background"
                        label={t('vibes.background')}
                        value={t(`vibes.style.${style}`)}
                        onPress={() => setStyle(VIBE_STYLES[(VIBE_STYLES.indexOf(style) + 1) % VIBE_STYLES.length]!)}
                      >
                        <View style={[styles.styleDot, { backgroundColor: VIBE_BACKGROUND[style] }]} />
                      </RoundButton>
                    ) : null}
                  </View>
                </View>
              </>
            ) : (
              <View style={[styles.trash, { top: canvas.height - 64 - 28 }, overTrash && styles.trashOver]} testID="vibe-trash" pointerEvents="none">
                <Ionicons name="trash-outline" size={overTrash ? 30 : 24} color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={[styles.bottom, { top: canvas.top + canvas.height + space.sm, paddingHorizontal: space.md }]}>
            {error ? (
              <Text style={[styles.error, { flex: 1, textAlign: 'left' }]} numberOfLines={2}>
                {error}
              </Text>
            ) : (
              <Pressable
                testID="vibe-publish-pill"
                accessibilityRole="button"
                accessibilityLabel={t('vibes.publishYours')}
                accessibilityHint={t('vibes.expiresHint')}
                accessibilityState={{ disabled: !canPublish || busy }}
                disabled={!canPublish || busy}
                onPress={publish}
                style={[styles.yours, (!canPublish || busy) && { opacity: 0.5 }]}
              >
                <RingAvatar uri={profile?.avatar_url ?? null} name={profile?.display_name ?? ''} size={30} />
                <Text style={styles.yoursText}>{t('vibes.yourVibes')}</Text>
              </Pressable>
            )}
            <Pressable
              testID="vibe-publish"
              accessibilityRole="button"
              accessibilityLabel={t('vibes.publish')}
              accessibilityState={{ disabled: !canPublish || busy, busy }}
              disabled={!canPublish || busy}
              onPress={publish}
              style={[styles.send, (!canPublish || busy) && { opacity: 0.5 }]}
            >
              {busy ? <Spinner size={22} color="#FFFFFF" /> : <Ionicons name="arrow-forward" size={26} color="#FFFFFF" />}
            </Pressable>
          </View>
        </>
      )}

      {composerInitial ? <TextComposer initial={composerInitial} kind={kind} onDone={finishText} /> : null}
    </View>
  );
}

function RoundButton({
  testID,
  icon,
  label,
  value,
  onPress,
  children,
}: {
  testID: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.75 }]}
    >
      {icon ? <Ionicons name={icon} size={26} color="#FFFFFF" /> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  modeLabel: { marginTop: space.lg, fontFamily: fonts.bold, fontSize: 14, letterSpacing: 2, color: '#FFFFFF' },
  canvas: { position: 'absolute', borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card },
  emptyHint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  emptyHintText: { fontFamily: fonts.semibold, fontSize: 18, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  topRow: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  tools: { gap: space.md, alignItems: 'center' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  aa: { fontFamily: fonts.semibold, fontSize: 20, color: '#FFFFFF' },
  styleDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#FFFFFF' },
  trash: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashOver: { width: 72, height: 72, borderRadius: 36, marginTop: -8, backgroundColor: colors.danger, borderColor: colors.danger },
  bottom: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  yours: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 52,
    borderRadius: 26,
    paddingHorizontal: space.sm,
    backgroundColor: '#26242F',
  },
  yoursText: { fontFamily: fonts.semibold, fontSize: 14, color: '#FFFFFF' },
  send: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger, textAlign: 'center', marginTop: space.sm },
});
