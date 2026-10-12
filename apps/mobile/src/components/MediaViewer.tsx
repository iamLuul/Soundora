import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, fonts, space } from '../theme';

export interface ViewerItem {
  key: string;
  kind: 'photo' | 'video';
  uri: string;
}

/** Arrastar mais que isto (px) para baixo, ou soltar rápido, fecha. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 900;

/**
 * Fotos e vídeos do post em tela cheia.
 * - Arrastar para o lado: próxima/anterior (com o contador "2/4" e as bolinhas).
 * - Arrastar para baixo: fecha (o fundo vai clareando enquanto arrasta).
 * - X no canto, longe da borda e da área do relógio/câmera. Na web também: setas e Esc.
 */
export function MediaViewer({ items, index, onClose }: { items: ViewerItem[]; index: number | null; onClose: () => void }) {
  return (
    <Modal visible={index !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* O Modal é outra raiz: os gestos precisam da própria GestureHandlerRootView (Android). */}
      <GestureHandlerRootView style={{ flex: 1 }}>{index !== null ? <Viewer items={items} start={index} onClose={onClose} /> : null}</GestureHandlerRootView>
    </Modal>
  );
}

function Viewer({ items, start, onClose }: { items: ViewerItem[]; start: number; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const list = useRef<FlatList<ViewerItem>>(null);
  const [current, setCurrent] = useState(Math.min(start, items.length - 1));
  const dragY = useSharedValue(0);

  // Arrastar para baixo fecha. Só vale gesto vertical: o horizontal fica com a lista (trocar de foto).
  const pan = Gesture.Pan()
    .withTestId('media-viewer-pan')
    .activeOffsetY([-12, 12])
    .failOffsetX([-12, 12])
    .onUpdate((e) => {
      // Para cima quase não mexe; para baixo acompanha o dedo.
      dragY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY) {
        dragY.value = withTiming(height, { duration: 180 }, (done) => {
          if (done) scheduleOnRN(onClose);
        });
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const content = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }, { scale: interpolate(dragY.value, [0, height], [1, 0.85], 'clamp') }],
  }));
  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(dragY.value, [0, height * 0.6], [1, 0.2], 'clamp') }));

  const go = (i: number) => {
    const next = Math.max(0, Math.min(items.length - 1, i));
    list.current?.scrollToIndex({ index: next, animated: true });
    setCurrent(next);
  };

  // Web: setas do teclado trocam, Esc fecha.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(current + 1);
      else if (e.key === 'ArrowLeft') go(current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== current && i >= 0 && i < items.length) setCurrent(i);
  };

  const many = items.length > 1;
  return (
    <View style={styles.screen} testID="media-viewer">
      <Animated.View style={[StyleSheet.absoluteFill, styles.black, backdrop]} />
      {/* touchAction (web): o navegador cuida do arrasto lateral; o vertical vem para o gesto. */}
      <GestureDetector gesture={pan} touchAction="pan-x">
        <Animated.View style={[{ flex: 1 }, content]}>
          <FlatList
            ref={list}
            testID="media-viewer-list"
            // Web: a própria lista diz ao navegador que só cuida do arrasto lateral; o vertical
            // (fechar) chega ao gesto. Sem isso, o navegador cancelava o arrasto para baixo.
            style={[{ flex: 1 }, Platform.OS === 'web' ? ({ touchAction: 'pan-x' } as object) : null]}
            data={items}
            keyExtractor={(m) => m.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={current}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <View style={{ width, height }} accessibilityLabel={t('post.mediaPosition', { current: index + 1, total: items.length })}>
                {item.kind === 'video' ? (
                  <ViewerVideo uri={item.uri} active={index === current} />
                ) : (
                  <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors />
                )}
              </View>
            )}
          />
        </Animated.View>
      </GestureDetector>

      {many ? (
        <View pointerEvents="none" style={[styles.top, { top: insets.top + space.md }]}>
          <Text style={styles.counter} testID="media-viewer-counter">
            {current + 1}/{items.length}
          </Text>
        </View>
      ) : null}
      <Pressable
        testID="media-viewer-close"
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        hitSlop={10}
        style={[styles.close, { top: insets.top + space.md }]}
      >
        <Ionicons name="close" size={24} color={colors.text} />
      </Pressable>

      {many && Platform.OS === 'web' ? (
        <>
          {current > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('post.previousMedia')} onPress={() => go(current - 1)} style={[styles.arrow, { left: space.lg }]}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          ) : null}
          {current < items.length - 1 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('post.nextMedia')} onPress={() => go(current + 1)} style={[styles.arrow, { right: space.lg }]}>
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      {many ? (
        <View pointerEvents="none" style={[styles.dots, { bottom: insets.bottom + space.xl }]}>
          {items.map((m, i) => (
            <View key={m.key} style={[styles.dot, i === current && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Vídeo dentro do visualizador: toca só quando está na tela; ao passar para o lado, pausa. */
function ViewerVideo({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  black: { backgroundColor: '#000' },
  // Mesma altura do X (40 px), centralizado.
  top: { position: 'absolute', left: 0, right: 0, height: 40, alignItems: 'center', justifyContent: 'center' },
  counter: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  // Longe da borda (topo e lateral) e num círculo escuro, para aparecer em foto clara.
  close: {
    position: 'absolute',
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: colors.text },
});
