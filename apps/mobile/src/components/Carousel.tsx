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
// ScrollView do gesture-handler: rolar o carrossel não troca de aba.
import { ScrollView } from 'react-native-gesture-handler';
import { colors } from '../theme';

const WEB = Platform.OS === 'web';
/** Largura da borda que some (px). Mais larga que a seta, para o cartão cortado sumir de verdade. */
const FADE = 96;

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
  // Borda que some aos poucos onde há mais para ver. Na web é uma máscara (o próprio conteúdo
  // fica transparente), então combina com qualquer fundo, inclusive o brilho roxo/rosa. No celular
  // o cartão cortado na borda já mostra que dá para deslizar.
  const mask = WEB && (scroll.canLeft || scroll.canRight) ? fadeMask(scroll.canLeft, scroll.canRight) : null;
  return (
    <View>
      <ScrollView
        style={mask}
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

/** Máscara da web: transparente na borda que tem mais conteúdo, opaca no resto. */
function fadeMask(left: boolean, right: boolean): ViewStyle {
  // Some depressa perto da borda (a seta fica sobre o "quase nada") e devagar perto do meio.
  const l = left ? `transparent 0, rgba(0,0,0,0.12) ${FADE * 0.35}px, rgba(0,0,0,0.55) ${FADE * 0.65}px, #000 ${FADE}px` : '#000 0';
  const r = right
    ? `#000 calc(100% - ${FADE}px), rgba(0,0,0,0.55) calc(100% - ${FADE * 0.65}px), rgba(0,0,0,0.12) calc(100% - ${FADE * 0.35}px), transparent 100%`
    : '#000 100%';
  const image = `linear-gradient(to right, ${l}, ${r})`;
  return { maskImage: image, WebkitMaskImage: image } as ViewStyle;
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
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    // Vidro escuro, como os botões do player: legível sobre o cartão e sobre o fundo.
    backgroundColor: 'rgba(30, 27, 46, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 14px rgba(10, 6, 30, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
