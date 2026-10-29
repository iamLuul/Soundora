import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useIsDesktop } from '../lib/layout';
import { Backdrop } from './Backdrop';
import { useCalmMotion } from './Reactive';

/** Arrastou mais que isto da largura (ou rápido para a esquerda): fecha. */
const CLOSE_FRACTION = 0.3;
const CLOSE_VELOCITY = 700;
const SLIDE = { duration: 260, easing: Easing.out(Easing.cubic) };

/**
 * Página que mora à esquerda do Início (Mensagens). Ela é aberta por cima do Início, que
 * continua desenhado embaixo, então:
 * - entra deslizando da esquerda (ou já no lugar, quando veio do arrasto do Início: `fromPeek`);
 * - arrastar para a esquerda leva a página junto com o dedo e mostra o Início atrás; soltou
 *   depois de ~30% (ou rápido), ela sai e volta para o Início; senão, volta para o lugar;
 * - a seta de voltar e o "voltar" do Android também fazem ela sair deslizando.
 * No computador (barra lateral) e com "reduzir movimento", sem deslizar.
 */
export function SidePage({ fromPeek = false, children }: { fromPeek?: boolean; children: (close: () => void) => ReactNode }) {
  const desktop = useIsDesktop();
  const calm = useCalmMotion();
  const still = desktop || calm;
  const { width } = useWindowDimensions();
  const x = useSharedValue(still || fromPeek ? 0 : -width);
  // Liberado para sair (a animação de saída já terminou): `go` continua a navegação.
  const [leaveWith, setLeaveWith] = useState<{ go: () => void } | null>(null);

  useEffect(() => {
    if (!still && !fromPeek) x.set(withTiming(0, SLIDE));
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Qualquer saída (seta, "voltar" do Android): segura a navegação, desliza para a esquerda e
  // só então deixa sair. Na web não (lá o bloqueio também perguntaria "sair do site?" ao
  // recarregar a página): a seta anima a saída antes de navegar.
  const guard = !still && Platform.OS !== 'web';
  usePreventRemove(guard && !leaveWith, ({ repeat }) => {
    x.set(
      withTiming(-width, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(setLeaveWith, { go: repeat });
      }),
    );
  });
  useEffect(() => {
    leaveWith?.go();
  }, [leaveWith]);

  const navigateBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const close = () => {
    if (still || guard) return navigateBack();
    x.set(
      withTiming(-width, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(setLeaveWith, { go: navigateBack });
      }),
    );
  };

  const pan = Gesture.Pan()
    .enabled(!still)
    .activeOffsetX(-20)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      x.set(Math.min(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX < -width * CLOSE_FRACTION || e.velocityX < -CLOSE_VELOCITY) {
        x.set(
          // Saiu pelo gesto: já está fora da tela, sai sem animar de novo.
          withTiming(-width, { duration: 180 }, (done) => {
            if (done) scheduleOnRN(setLeaveWith, { go: navigateBack });
          }),
        );
      } else {
        x.set(withSpring(0, { damping: 22, stiffness: 260 }));
      }
    });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.page, slide]}>
          <Backdrop>{children(close)}</Backdrop>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  // Sombra na borda direita: separa a página do Início que aparece atrás.
  page: { flex: 1, boxShadow: '8px 0 24px rgba(10, 6, 30, 0.45)' },
});
