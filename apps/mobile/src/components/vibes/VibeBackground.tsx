import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { VibeStyle } from '../../lib/api';
import { VIBE_GRADIENT } from './colors';

/** Fundo em degradê da vibe de texto, música e post (ocupa tudo, atrás do conteúdo). */
export function VibeBackground({ style }: { style: VibeStyle }) {
  const [from, to] = VIBE_GRADIENT[style];
  const id = `vibe-bg-${style}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={`vibe-bg-${style}`}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
