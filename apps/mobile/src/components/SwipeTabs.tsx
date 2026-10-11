import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

/** Abas que se alcançam arrastando para os lados, da esquerda para a direita (o + fica de fora). */
export const SWIPE_TABS = ['index', 'discover', 'music', 'me'] as const;

/** Arrasto mínimo (px) ou velocidade (px/s) para trocar de aba. */
const DISTANCE = 70;
const VELOCITY = 500;

/**
 * Aba vizinha depois de um arrasto: o dedo indo para a esquerda mostra a aba da direita
 * (como virar página), e para a direita volta. null = fica onde está.
 */
export function swipeTarget(current: string, dx: number, vx: number): string | null {
  const i = (SWIPE_TABS as readonly string[]).indexOf(current);
  if (i < 0) return null;
  if (Math.abs(dx) < DISTANCE && Math.abs(vx) < VELOCITY) return null;
  const next = i + (dx < 0 ? 1 : -1);
  return SWIPE_TABS[next] ?? null;
}

/**
 * Na web, soltar o mouse depois de arrastar ainda conta como clique no que estava embaixo
 * (abriria o post). No celular o gesture-handler já cancela o toque.
 */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 500);
}

/**
 * Envolve a tela de uma aba: arrastar para os lados passa para a aba vizinha.
 * Só ativa com movimento claramente horizontal, então rolar a lista continua normal; e os
 * gestos de dentro (cartões do Descobrir, fila de vibes) ganham porque ativam antes.
 */
export function SwipeTabs({ route, onNavigate, children }: { route: string; onNavigate: (name: string) => void; children: ReactNode }) {
  const enabled = (SWIPE_TABS as readonly string[]).includes(route);
  const pan = Gesture.Pan()
    .enabled(enabled)
    .runOnJS(true)
    .activeOffsetX([-30, 30])
    .failOffsetY([-20, 20])
    .onStart(() => {
      if (Platform.OS === 'web') swallowNextClick();
    })
    .onEnd((e) => {
      const target = swipeTarget(route, e.translationX, e.velocityX);
      if (target) onNavigate(target);
    });
  // O gesto precisa de uma View nativa de verdade (a tela em si é um componente, sem view própria).
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
