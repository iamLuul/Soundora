import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
// ScrollView do gesture-handler: rolar o carrossel não troca de aba.
import { ScrollView } from 'react-native-gesture-handler';
import { colors } from '../theme';

const WEB = Platform.OS === 'web';
const FADE = 48;

/**
 * Fileira que desliza para os lados (contas para seguir, reviews do Para você): degradê nas
 * bordas quando há mais para ver e, na web, setas (com mouse não dá para arrastar).
 */
export function Carousel({
  children,
  contentStyle,
  arrowTestID,
  previousLabel,
  nextLabel,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** testID das setas: `${arrowTestID}-prev` e `${arrowTestID}-next`. */
  arrowTestID: string;
  previousLabel: string;
  nextLabel: string;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const scroll = useScrollArrows(ref);
  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={contentStyle}
        onScroll={scroll.onScroll}
        scrollEventThrottle={32}
        onLayout={(e) => scroll.setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => scroll.setContent(w)}
      >
        {children}
      </ScrollView>
      {scroll.canLeft ? <EdgeFade side="left" /> : null}
      {scroll.canRight ? <EdgeFade side="right" /> : null}
      {WEB && scroll.canLeft ? <ArrowButton testID={`${arrowTestID}-prev`} side="left" label={previousLabel} onPress={() => scroll.page(-1)} /> : null}
      {WEB && scroll.canRight ? <ArrowButton testID={`${arrowTestID}-next`} side="right" label={nextLabel} onPress={() => scroll.page(1)} /> : null}
    </View>
  );
}

/** Posição do carrossel: dá para ir para a esquerda/direita? E rolar uma "página" com as setas. */
function useScrollArrows(ref: RefObject<ScrollViewInstance | null>) {
  const [x, setX] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const max = Math.max(0, content - viewport);
  return {
    setViewport,
    setContent,
    canLeft: x > 4,
    canRight: viewport > 0 && x < max - 4,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => setX(e.nativeEvent.contentOffset.x),
    page: (dir: 1 | -1) => {
      const to = Math.min(max, Math.max(0, x + dir * viewport * 0.8));
      ref.current?.scrollTo({ x: to, animated: true });
      setX(to);
    },
  };
}

/** Degradê do fundo da tela por cima da borda do carrossel (não pega toques). */
function EdgeFade({ side }: { side: 'left' | 'right' }) {
  const id = `fade-${side}`;
  return (
    <View pointerEvents="none" style={[styles.fade, side === 'left' ? { left: 0 } : { right: 0 }]}>
      <Svg width={FADE} height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={side === 'left' ? 1 : 0} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={side === 'left' ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={FADE} height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function ArrowButton({ testID, side, label, onPress }: { testID: string; side: 'left' | 'right'; label: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.arrow,
        side === 'left' ? { left: 4 } : { right: 4 },
        (pressed || hovered) && { backgroundColor: colors.primary },
      ]}
    >
      <Ionicons name={side === 'left' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
