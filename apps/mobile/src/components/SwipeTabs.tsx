import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, Dimensions, Easing, Platform, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { display } from '../lib/display';
import { useIsDesktop } from '../lib/layout';

/** Abas que se alcançam arrastando para os lados, da esquerda para a direita (o + fica de fora). */
export const SWIPE_TABS = ['index', 'discover', 'music', 'me'] as const;

/** Arrasto mínimo (px) ou velocidade (px/s) para trocar de aba. */
const DISTANCE = 70;
const VELOCITY = 500;
/** O gesto só começa depois de 30 px na horizontal (para não brigar com a rolagem). */
const ACTIVATE = 30;
/** Nas pontas (sem aba vizinha) a tela anda só um pouco, como um elástico. */
const EDGE_RESISTANCE = 0.25;

const useNativeDriver = Platform.OS !== 'web';

/**
 * Aba vizinha depois de um arrasto: o dedo indo para a esquerda mostra a aba da direita
 * (como virar página), e para a direita volta. null = fica onde está.
 */
export function swipeTarget(current: string, dx: number, vx: number): string | null {
  const i = (SWIPE_TABS as readonly string[]).indexOf(current);
  if (i < 0) return null;
  if (Math.abs(dx) < DISTANCE && Math.abs(vx) < VELOCITY) return null;
  // Início puxado para o lado do ícone de mensagens (a esquerda): abre as Mensagens.
  if (current === 'index' && dx > 0) return MESSAGES;
  const next = i + (dx < 0 ? 1 : -1);
  return SWIPE_TABS[next] ?? null;
}

/** Destino especial do arrasto no Início: a tela de Mensagens (fora das abas). */
export const MESSAGES = 'messages';

/** As vizinhas de uma aba no carrossel (null nas pontas). */
export function swipeNeighbors(current: string): { left: string | null; right: string | null } {
  const i = (SWIPE_TABS as readonly string[]).indexOf(current);
  if (i < 0) return { left: null, right: null };
  return { left: SWIPE_TABS[i - 1] ?? null, right: SWIPE_TABS[i + 1] ?? null };
}

/** Quanto a tela anda com o dedo: some o trecho de ativação e vira elástico onde não há vizinha. */
export function dragOffset(current: string, dx: number): number {
  const moved = Math.sign(dx) * Math.max(0, Math.abs(dx) - ACTIVATE);
  const { left, right } = swipeNeighbors(current);
  // No Início, à esquerda ficam as Mensagens: a tela anda um pouco mais (meio elástico).
  if (current === 'index' && moved > 0) return moved * 0.5;
  const hasNeighbor = moved < 0 ? !!right : !!left;
  return hasNeighbor ? moved : moved * EDGE_RESISTANCE;
}

// ---------------------------------------------------------------------------------------------
// Carrossel das abas
//
// Cada aba fica a uma largura de tela da focada (à esquerda ou à direita, pela posição na
// barra) e desliza até o lugar na troca. Enquanto o dedo arrasta, a aba atual e as duas
// vizinhas andam juntas com ele (`drag`), então a próxima aparece entrando pelo lado. As
// outras abas ficam paradas fora da tela, para nenhuma passar por cima da vizinha.
//
// Tudo são valores Animated ligados ao estilo de cada cena (o mesmo `progress` que a barra de
// abas anima), então o deslizar roda no thread nativo.
// ---------------------------------------------------------------------------------------------

/** Largura da área das telas (atualizada pelo onLayout). */
const width = new Animated.Value(Dimensions.get('window').width);
let widthNow = Dimensions.get('window').width;
/** Deslocamento do dedo (px). */
const drag = new Animated.Value(0);
let dragging = false;
/** 1 = a cena anda com o dedo (a atual e as vizinhas); 0 = fica parada. */
const lanes = new Map<string, Animated.Value>();
function lane(name: string) {
  let v = lanes.get(name);
  if (!v) lanes.set(name, (v = new Animated.Value(0)));
  return v;
}
/** 0 quando a troca envolve o +: o postar abre e fecha sem deslizar, como antes. */
const slide = new Animated.Value(1);
let lastFocused = 'index';
/** Soltou o dedo numa troca: a cena termina o caminho junto com a animação da aba. */
let releasing = false;

/** Mesma curva para a troca da aba e para o resto do arrasto: as duas andam juntas. */
// Acessibilidade › Reduzir movimento: a troca é instantânea e a tela não acompanha o dedo.
const SLIDE_CONFIG = { duration: display.reduceMotion ? 0 : 300, easing: Easing.out(Easing.cubic) };

/**
 * Opções de cada aba no navegador: o + não tem animação; as outras, o carrossel.
 * `carousel` false (barra lateral do desktop, onde não se arrasta): troca na hora. Na web a
 * animação roda em JavaScript e re-renderiza a tela inteira a cada quadro; no desktop ela só
 * fazia cada clique parecer lento.
 */
export function carouselOptions(name: string, carousel = true) {
  if (name === 'compose' || !carousel) return {};
  const myLane = lane(name);
  return {
    transitionSpec: { animation: 'timing' as const, config: SLIDE_CONFIG },
    sceneStyleInterpolator: ({ current }: { current: { progress: Animated.AnimatedInterpolation<number> } }) => ({
      sceneStyle: {
        transform: [
          {
            translateX: Animated.add(Animated.multiply(Animated.multiply(current.progress, width), slide), Animated.multiply(drag, myLane)),
          },
        ],
      },
    }),
  };
}

/**
 * A troca de aba começou (evento transitionStart do navegador, antes de a animação rodar).
 * Decide se desliza e, se veio de um arrasto, leva o resto do arrasto a zero junto.
 */
export function onTabTransition(name: string) {
  const involvesCompose = name === 'compose' || lastFocused === 'compose';
  lastFocused = name;
  slide.setValue(involvesCompose ? 0 : 1);
  if (releasing) {
    releasing = false;
    Animated.timing(drag, { ...SLIDE_CONFIG, toValue: 0, useNativeDriver }).start();
  }
}

function springBack() {
  releasing = false;
  Animated.spring(drag, { toValue: 0, useNativeDriver, bounciness: 0, speed: 18 }).start();
}

/**
 * Algo de dentro da tela está usando o arrasto para os lados (a linha do tempo de um vídeo):
 * enquanto isso, arrastar não troca de aba nem abre as Mensagens.
 */
let swipeLocked = false;
export function lockSwipe(locked: boolean) {
  swipeLocked = locked;
}

function startDrag(route: string) {
  if (swipeLocked) return;
  dragging = true;
  releasing = false;
  drag.stopAnimation();
  drag.setValue(0);
  slide.setValue(1);
  const { left, right } = swipeNeighbors(route);
  const moving = new Set([route, left, right].filter(Boolean) as string[]);
  for (const [name, v] of lanes) v.setValue(moving.has(name) ? 1 : 0);
}

function moveDrag(route: string, dx: number) {
  if (display.reduceMotion) return;
  if (dragging) drag.setValue(dragOffset(route, dx));
}

/** Soltou: troca de aba (e a cena termina o caminho) ou volta para o lugar. */
function endDrag(route: string, dx: number, vx: number, onNavigate: (name: string) => void) {
  // O arrasto nem começou (estava travado): nada a fazer.
  if (!dragging) return;
  const target = swipeTarget(route, dx, vx);
  dragging = false;
  if (Platform.OS === 'web') swallowNextClick();
  if (!target) return springBack();
  if (target === MESSAGES && route === 'index') {
    springBack();
    router.push('/messages');
    return;
  }
  releasing = true;
  onNavigate(target);
  // Se a troca não começar (navegação recusada), a tela volta para o lugar.
  setTimeout(() => releasing && springBack(), 250);
}

/** Gesto cancelado (outro gesto ganhou, por exemplo) no meio do arrasto. */
function cancelDrag() {
  if (!dragging) return;
  dragging = false;
  if (Platform.OS === 'web') swallowNextClick();
  springBack();
}

/**
 * Na web, soltar o mouse depois de arrastar ainda conta como clique no que estava embaixo
 * (abriria o post). Chamado ao soltar (o clique vem logo depois), não no começo: num arrasto
 * lento o bloqueio expirava antes. No celular o gesture-handler já cancela o toque.
 */
export function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 300);
}

/**
 * Envolve a tela de uma aba: arrastar para os lados puxa a aba vizinha, em carrossel.
 * Só ativa com movimento claramente horizontal, então rolar a lista continua normal; e os
 * gestos de dentro (cartões do Descobrir, fila de vibes) ganham porque ativam antes.
 */
export function SwipeTabs({
  route,
  focused,
  onNavigate,
  onPreload,
  focusEvents,
  children,
}: {
  route: string;
  /** Aba aberta agora: as outras ficam fora da tela e escondidas do leitor de tela. */
  focused: boolean;
  onNavigate: (name: string) => void;
  /** Monta a aba vizinha antes de ela aparecer (para não entrar vazia). */
  onPreload?: (name: string) => void;
  /**
   * Avisos de foco/saída da aba (navigation.addListener). A aba também perde o foco quando
   * outra tela (post, perfil, notificações…) abre por cima das abas.
   */
  focusEvents?: { addListener: (event: 'focus' | 'blur', cb: () => void) => () => void; isFocused: () => boolean };
  children: ReactNode;
}) {
  // Só a aba visível e sem nada por cima reage ao arrasto. Sem isto, uma aba escondida (o
  // Início, por exemplo) ainda pegava o gesto: arrastar em outra tela abria as Mensagens em vez
  // do movimento normal (voltar, trocar de aba).
  const active = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        if (!focusEvents) return () => {};
        const offFocus = focusEvents.addListener('focus', onChange);
        const offBlur = focusEvents.addListener('blur', onChange);
        return () => {
          offFocus();
          offBlur();
        };
      },
      [focusEvents],
    ),
    () => (focusEvents ? focusEvents.isFocused() : focused),
  );
  // Desktop: troca de aba pela barra lateral; arrastar com o mouse não troca.
  const desktop = useIsDesktop();
  const enabled = !desktop && active && (SWIPE_TABS as readonly string[]).includes(route);
  const pan = Gesture.Pan()
    .enabled(enabled)
    .runOnJS(true)
    .activeOffsetX([-ACTIVATE, ACTIVATE])
    .failOffsetY([-20, 20])
    .onStart(() => {
      startDrag(route);
      const { left, right } = swipeNeighbors(route);
      for (const n of [left, right]) if (n && onPreload) onPreload(n);
    })
    .onUpdate((e) => moveDrag(route, e.translationX))
    .onEnd((e) => endDrag(route, e.translationX, e.velocityX, onNavigate))
    .onFinalize(cancelDrag);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== widthNow) {
      widthNow = w;
      width.setValue(w);
    }
  };

  // O gesto precisa de uma View nativa de verdade (a tela em si é um componente, sem view própria).
  return (
    <GestureDetector gesture={pan}>
      <View
        style={{ flex: 1 }}
        collapsable={false}
        onLayout={focused ? onLayout : undefined}
        // As abas fechadas continuam montadas, fora da tela: o leitor de tela não deve chegar nelas.
        accessibilityElementsHidden={!focused}
        importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
        aria-hidden={!focused}
      >
        {children}
      </View>
    </GestureDetector>
  );
}
