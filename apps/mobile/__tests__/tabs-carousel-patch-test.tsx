// Carrossel das abas no celular: as abas vizinhas precisam continuar desenhadas (sem display:none)
// para aparecerem durante o arrasto. Garante que o patch do expo-router (patches/) foi aplicado.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MaybeScreen } = require('expo-router/build/react-navigation/bottom-tabs/views/ScreenFallback');

jest.mock('react-native-screens', () => {
  const { View } = jest.requireActual('react-native');
  return {
    screensEnabled: () => true,
    Screen: ({ activityState, ...rest }: { activityState: number; style?: object }) => <View {...rest} style={[rest.style, { display: activityState !== 0 ? 'flex' : 'none' }]} />,
    ScreenContainer: View,
  };
});

test('aba inativa com detachInactiveScreens=false continua visível', async () => {
  await render(
    <MaybeScreen enabled={false} active={0} testID="aba">
      <Text>Descobrir</Text>
    </MaybeScreen>,
  );
  expect(StyleSheet.flatten(screen.getByTestId('aba').props.style)?.display).not.toBe('none');
});
