import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, glass, radius, space } from '../theme';
import { useCalmMotion } from './Reactive';

/** Puxou mais que isto da altura do menu (ou rápido para baixo): fecha. */
const CLOSE_FRACTION = 0.3;
const CLOSE_VELOCITY = 900;
const OPEN_SPRING = { damping: 22, stiffness: 260, mass: 0.8 };

/**
 * Menu que sobe de baixo (sobre um fundo escuro), em Android, iOS e Web:
 * - sobe deslizando ao abrir e desce ao fechar;
 * - acompanha o dedo (ou o mouse) para baixo: soltou depois de puxar uns 30% dele, ou puxou
 *   rápido, ele fecha; senão volta para o lugar com uma mola;
 * - tocar no fundo escuro ou o "voltar" do Android também fecham.
 * Com "reduzir movimento", abre e fecha sem deslizar (o arrasto continua funcionando).
 */
export function BottomSheet({
  visible,
  onClose,
  label,
  children,
  style,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  /** Nome do fundo escuro para o leitor de tela (ex.: "Cancelar", "Fechar"). */
  label: string;
  children: ReactNode;
  /** Estilo da folha (largura, espaçamento); o vidro, os cantos e o puxador já vêm. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const calm = useCalmMotion();
  // Continua montado durante a animação de saída (o Modal sumiria na hora).
  const [mounted, setMounted] = useState(visible);
  const height = useSharedValue(600);
  // 0 = aberto; height = escondido embaixo.
  const offset = useSharedValue(600);
  // Fechando pela pessoa (fundo, arrasto, voltar): no fim avisa quem abriu.
  const closing = useSharedValue(false);

  const finish = () => {
    setMounted(false);
    if (closing.get()) {
      closing.set(false);
      onClose();
    }
  };

  /** Desce o menu e, no fim, avisa quem abriu (fechar pela pessoa: fundo, arrasto, voltar). */
  const dismiss = () => {
    if (closing.get()) return;
    closing.set(true);
    if (calm) return finish();
    offset.set(
      withTiming(height.get(), { duration: 200 }, (done) => {
        if (done) scheduleOnRN(finish);
      }),
    );
  };

  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible) {
      closing.set(false);
      offset.set(calm ? 0 : withSpring(0, OPEN_SPRING));
    } else if (mounted && !closing.get()) {
      // Fechado por fora (escolheu uma opção): desce e desmonta.
      if (calm) queueMicrotask(() => setMounted(false));
      else
        offset.set(
          withTiming(height.get(), { duration: 180 }, (done) => {
            if (done) scheduleOnRN(setMounted, false);
          }),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a abrir/fechar
  }, [visible]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    const wasHidden = offset.get() >= height.get();
    height.set(h);
    // Primeira medida: começa escondido na altura certa e sobe dali.
    if (wasHidden && visible && !closing.get()) {
      offset.set(h);
      offset.set(calm ? 0 : withSpring(0, OPEN_SPRING));
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      // Para baixo acompanha o dedo; para cima, só um pouco (elástico).
      offset.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15);
    })
    .onEnd((e) => {
      const h = height.get();
      if (e.translationY > h * CLOSE_FRACTION || e.velocityY > CLOSE_VELOCITY) scheduleOnRN(dismiss);
      else offset.set(withSpring(0, OPEN_SPRING));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: interpolate(offset.get(), [0, height.get()], [1, 0], 'clamp') }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      {/* No Android, gestos dentro de um Modal precisam da própria raiz do gesture-handler. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
          <Pressable
            testID={testID ? `${testID}-backdrop` : undefined}
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel={label}
          />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View testID={testID} onLayout={onLayout} style={[styles.sheet, style, sheetStyle]} accessibilityViewIsModal onAccessibilityEscape={dismiss}>
            <View style={styles.grabber} />
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: colors.overlay },
  sheet: {
    ...glass.sheet,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.sm,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  // O "puxador" no topo: mostra que o menu pode ser arrastado.
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginTop: 2, marginBottom: space.sm },
});
