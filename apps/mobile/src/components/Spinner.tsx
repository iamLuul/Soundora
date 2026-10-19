import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';

/** Web: girar é uma animação CSS (sem JavaScript por quadro; o Animated re-renderizava a cada quadro). */
const webSpin =
  Platform.OS === 'web'
    ? StyleSheet.create({
        spin: {
          animationKeyframes: { from: { transform: [{ rotate: '0deg' }] }, to: { transform: [{ rotate: '360deg' }] } },
          animationDuration: '850ms',
          animationIterationCount: 'infinite',
          animationTimingFunction: 'linear',
        } as ViewStyle,
      }).spin
    : null;

/**
 * Indicador de carregamento do Soundhora: um anel fino com um arco de ponta redonda girando
 * liso sobre si mesmo. Substitui o ActivityIndicator do sistema (as "pétalas" do iOS e o
 * círculo do Android), para ficar igual em todas as plataformas e na cor da marca.
 * Com `spinning={false}` o arco fica parado (o puxar para atualizar gira ele com o dedo).
 */
export function Spinner({
  size = 26,
  // Lilás do app: no fundo escuro tem contraste melhor que o roxo dos botões.
  color = colors.muted,
  spinning = true,
  style,
  testID = 'spinner',
}: {
  size?: number;
  color?: string;
  spinning?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [turn] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!spinning || process.env.NODE_ENV === 'test' || Platform.OS === 'web') return;
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn, spinning]);

  const stroke = Math.max(2.5, size / 9);
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  // Um arco de ~30% do anel.
  const arc = length * 0.3;
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      style={[{ alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Animated.View style={[{ width: size, height: size }, webSpin ? (spinning ? webSpin : null) : { transform: [{ rotate: spinning ? rotate : '0deg' }] }]}>
        <Svg width={size} height={size}>
          {/* Trilho bem apagado, para o arco não parecer solto. */}
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.18} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${length}`}
            fill="none"
            // O arco começa no topo.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
