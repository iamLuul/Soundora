// Chave liga/desliga do app. Bloqueada, fica a mesma chave sem cor (cinza e apagada), em vez do
// quadro claro que o Switch da web desenha quando está desabilitado.
import { Platform, StyleSheet, Switch, View, type SwitchProps } from 'react-native';
import { colors } from '../theme';

type Props = Omit<SwitchProps, 'trackColor' | 'thumbColor'>;

export function Toggle({ disabled, onValueChange, testID, accessibilityLabel, value, ...rest }: Props) {
  const web = Platform.OS === 'web';
  return (
    <View
      style={disabled ? styles.off : undefined}
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityState={disabled ? { disabled: true } : undefined}
      aria-disabled={disabled || undefined}
    >
      <Switch
        {...rest}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        // Na web o "disabled" troca as cores pelo cinza claro padrão; aqui o bloqueio é o
        // pointerEvents acima e a chave mantém as cores do app.
        disabled={web ? false : disabled}
        focusable={!disabled}
        onValueChange={disabled ? undefined : onValueChange}
        trackColor={{ true: colors.primary, false: colors.surface }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  off: {
    opacity: 0.45,
    ...(Platform.OS === 'web' ? ({ filter: 'grayscale(1)' } as object) : null),
  },
});
