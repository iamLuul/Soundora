import { useState, type ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { display } from '../lib/display';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Mola curta, com um pouco de balanço: o toque responde na hora e assenta rápido. */
export const SPRING = { damping: 14, stiffness: 320, mass: 0.6 };

/** "Reduzir movimento" do aparelho ou das Configurações › Acessibilidade. */
export function useCalmMotion(): boolean {
  return useReducedMotion() || display.reduceMotion;
}

export type ReactiveState = { pressed: boolean; hovered: boolean };

export type ReactiveProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: ReactiveState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: ReactiveState) => ReactNode);
  /** Quanto encolhe ao tocar (1 = nada). */
  pressScale?: number;
  /** Quanto cresce com o mouse em cima (web; 1 = nada). */
  hoverScale?: number;
};

/**
 * Botão que reage: encolhe um pouco ao tocar e volta com mola; na web, cresce de leve com o
 * mouse em cima. Com "reduzir movimento", fica parado (só o estilo de tocado/apontado muda).
 */
export function Reactive({ style, children, pressScale = 0.96, hoverScale = 1, onPressIn, onPressOut, onHoverIn, onHoverOut, ...rest }: ReactiveProps) {
  const calm = useCalmMotion();
  const scale = useSharedValue(1);
  const [state, setState] = useState<ReactiveState>({ pressed: false, hovered: false });
  const to = (value: number) => scale.set(calm ? 1 : withSpring(value, SPRING));
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        to(pressScale);
        setState((s) => ({ ...s, pressed: true }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(state.hovered ? hoverScale : 1);
        setState((s) => ({ ...s, pressed: false }));
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        if (Platform.OS === 'web') to(hoverScale);
        setState((s) => ({ ...s, hovered: true }));
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        to(1);
        setState((s) => ({ ...s, hovered: false }));
        onHoverOut?.(e);
      }}
      style={[typeof style === 'function' ? style(state) : style, animated]}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}

/**
 * "Pulo" de confirmação (curtir, salvar): cresce e volta com mola. Devolve o estilo animado e a
 * função que dispara o pulo.
 */
export function usePop(amount = 1.35) {
  const calm = useCalmMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const pop = () => {
    if (calm) return;
    scale.set(withSequence(withSpring(amount, { damping: 8, stiffness: 500, mass: 0.4 }), withSpring(1, SPRING)));
  };
  return { style, pop };
}
