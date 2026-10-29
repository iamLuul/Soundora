// Menus que sobem de baixo: tocar no fundo (ou no "voltar") fecha; o conteúdo continua clicável.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { BottomSheet } from '../src/components/BottomSheet';

test('aberto mostra o conteúdo; tocar no fundo escuro fecha', async () => {
  const onClose = jest.fn();
  const onPick = jest.fn();
  await render(
    <BottomSheet visible onClose={onClose} label="Cancelar" testID="sheet">
      <Pressable onPress={onPick}>
        <Text>Denunciar</Text>
      </Pressable>
    </BottomSheet>,
  );
  await fireEvent.press(screen.getByText('Denunciar'));
  expect(onPick).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Cancelar', { includeHiddenElements: true }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test('fechado não desenha nada', async () => {
  await render(
    <BottomSheet visible={false} onClose={() => {}} label="Cancelar">
      <Text>Denunciar</Text>
    </BottomSheet>,
  );
  expect(screen.queryByText('Denunciar')).toBeNull();
});
