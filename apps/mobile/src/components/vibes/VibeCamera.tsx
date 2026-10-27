import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type FlashMode } from 'expo-camera';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { VIBE_VIDEO_MAX } from '../../lib/api';
import { colors, fonts, space } from '../../theme';

/** Foto ou vídeo escolhido (câmera ou galeria), antes de ir para a vibe. */
export interface CapturedMedia {
  type: 'photo' | 'video';
  uri: string;
  width: number;
  height: number;
  durationMs: number | null;
  fileSize: number | null;
}

const FLASH_ORDER: FlashMode[] = ['off', 'on', 'auto'];
const FLASH_ICON: Record<string, 'flash-off-outline' | 'flash-outline' | 'flash'> = { off: 'flash-off-outline', on: 'flash', auto: 'flash-outline' };
const RING = 84;

/**
 * Primeira tela de criar uma vibe, como a câmera do Story: a câmera ocupa o cartão; em cima o X e
 * o flash; à esquerda, criar só com texto (Aa); embaixo a galeria, o botão de
 * tirar foto (segurar grava vídeo, até 30 s) e o de virar a câmera.
 */
export function VibeCamera({
  width,
  height,
  onMedia,
  onGallery,
  onText,
  onClose,
}: {
  width: number;
  height: number;
  onMedia: (m: CapturedMedia) => void;
  onGallery: () => void;
  onText: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [mode, setMode] = useState<'picture' | 'video'>('picture');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const wantRecord = useRef(false);
  const recordStart = useRef(0);

  // Pede a câmera na primeira vez (a pessoa pode negar e seguir com galeria, texto e música).
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  // Barra do vídeo gravando (até 30 s).
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(Date.now() - recordStart.current), 100);
    return () => clearInterval(id);
  }, [recording]);

  const takePhoto = async () => {
    if (!camera.current || busy || !ready) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9 });
      if (pic?.uri) onMedia({ type: 'photo', uri: pic.uri, width: pic.width, height: pic.height, durationMs: null, fileSize: null });
    } finally {
      setBusy(false);
    }
  };

  // Segurar: troca a câmera para vídeo e grava assim que ela estiver pronta.
  const startVideo = async () => {
    if (busy) return;
    if (!mic?.granted && mic?.canAskAgain !== false) await requestMic();
    wantRecord.current = true;
    if (mode === 'video' && ready) void record();
    else {
      setReady(false);
      setMode('video');
    }
  };
  const record = async () => {
    if (!camera.current || !wantRecord.current) return;
    wantRecord.current = false;
    recordStart.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const video = await camera.current.recordAsync({ maxDuration: VIBE_VIDEO_MAX.seconds });
      const durationMs = Math.min(Date.now() - recordStart.current, VIBE_VIDEO_MAX.seconds * 1000);
      if (video?.uri) onMedia({ type: 'video', uri: video.uri, width: 0, height: 0, durationMs, fileSize: null });
    } finally {
      setRecording(false);
      setMode('picture');
    }
  };
  const stopVideo = () => {
    wantRecord.current = false;
    if (recording) camera.current?.stopRecording();
  };

  const granted = !!permission?.granted;
  const progress = Math.min(1, elapsed / (VIBE_VIDEO_MAX.seconds * 1000));
  const circumference = Math.PI * (RING - 6);

  return (
    <View style={[styles.card, { width, height }]} testID="vibe-camera">
      {granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode={mode}
          mirror={facing === 'front'}
          mute={!mic?.granted}
          onCameraReady={() => {
            setReady(true);
            if (mode === 'video' && wantRecord.current) void record();
          }}
        />
      ) : (
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={44} color={colors.text} />
          <Text style={styles.permissionTitle}>{t('vibes.cameraPermissionTitle')}</Text>
          <Text style={styles.permissionBody}>{t('vibes.cameraPermissionBody')}</Text>
          {permission ? (
            <Pressable
              testID="vibe-camera-allow"
              accessibilityRole="button"
              onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>{permission.canAskAgain ? t('vibes.allowCamera') : t('vibes.openSettings')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.top} pointerEvents="box-none">
        <IconButton testID="vibe-close" icon="close" size={30} label={t('common.cancel')} onPress={onClose} />
        {granted && facing === 'back' ? (
          <IconButton
            testID="vibe-flash"
            icon={FLASH_ICON[flash]!}
            size={26}
            label={t(`vibes.flash.${flash}`)}
            onPress={() => setFlash(FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length]!)}
          />
        ) : (
          <View style={{ width: 44 }} />
        )}
        <View style={{ width: 44 }} />
      </View>

      {!recording ? (
        <View style={styles.side} pointerEvents="box-none">
          <Pressable
            testID="vibe-mode-text"
            accessibilityRole="button"
            accessibilityLabel={t('vibes.createText')}
            onPress={onText}
            hitSlop={8}
            style={styles.sideButton}
          >
            <Text style={styles.aa}>Aa</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.bottom} pointerEvents="box-none">
        <Pressable
          testID="vibe-mode-library"
          accessibilityRole="button"
          accessibilityLabel={t('vibes.library')}
          onPress={onGallery}
          style={[styles.gallery, recording && { opacity: 0 }]}
          disabled={recording}
        >
          <Ionicons name="images-outline" size={24} color="#FFFFFF" />
        </Pressable>

        <Pressable
          testID="vibe-shutter"
          accessibilityRole="button"
          accessibilityLabel={t('vibes.shutter')}
          accessibilityHint={t('vibes.shutterHint')}
          accessibilityState={{ disabled: !granted, busy }}
          disabled={!granted}
          onPress={takePhoto}
          onLongPress={startVideo}
          delayLongPress={250}
          onPressOut={stopVideo}
          style={[styles.shutter, !granted && { opacity: 0.4 }]}
        >
          <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
            <Circle cx={RING / 2} cy={RING / 2} r={(RING - 6) / 2} stroke="#FFFFFF" strokeWidth={5} fill="none" />
            {recording ? (
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={(RING - 6) / 2}
                stroke={colors.primary}
                strokeWidth={5}
                fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            ) : null}
          </Svg>
          <View style={[styles.shutterInner, recording && styles.shutterRecording]} />
        </Pressable>

        <Pressable
          testID="vibe-flip"
          accessibilityRole="button"
          accessibilityLabel={t('vibes.flip')}
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          disabled={!granted || recording}
          style={[styles.flip, (!granted || recording) && { opacity: recording ? 0 : 0.4 }]}
        >
          <Ionicons name="camera-reverse-outline" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function IconButton({
  testID,
  icon,
  size,
  label,
  onPress,
}: {
  testID: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={styles.iconButton}>
      <Ionicons name={icon} size={size} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  permission: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  permissionTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, textAlign: 'center' },
  permissionBody: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  permissionButton: { marginTop: space.sm, backgroundColor: colors.primary, borderRadius: 22, paddingHorizontal: space.xl, paddingVertical: space.md },
  permissionButtonText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  top: { position: 'absolute', top: space.lg, left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', left: space.md, top: '38%', gap: space.lg },
  sideButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  aa: { fontFamily: fonts.semibold, fontSize: 30, color: '#FFFFFF' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  gallery: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutter: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: RING - 18, height: RING - 18, borderRadius: (RING - 18) / 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  shutterRecording: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.danger },
  flip: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});
