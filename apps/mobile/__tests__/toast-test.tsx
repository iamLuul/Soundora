// Aviso curto de sucesso: aparece, é anunciado e some sozinho.
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { showToast, TOAST_MS, ToastHost } from '../src/components/Toast';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

test('mostra o texto, anuncia para o leitor de tela e some', async () => {
  jest.useFakeTimers();
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  await render(<ToastHost />);
  expect(screen.queryByTestId('toast')).toBeNull();
  await act(async () => showToast('Review publicada.'));
  expect(screen.getByText('Review publicada.')).toBeTruthy();
  expect(announce).toHaveBeenCalledWith('Review publicada.');
  // Um aviso novo troca o anterior.
  await act(async () => showToast('Post apagado.'));
  expect(screen.queryByText('Review publicada.')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(TOAST_MS + 1000);
  });
  expect(screen.queryByTestId('toast')).toBeNull();
  jest.useRealTimers();
});
