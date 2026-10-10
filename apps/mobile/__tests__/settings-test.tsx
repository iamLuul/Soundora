import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import DeleteAccountScreen from '../src/app/settings/delete-account';
import { AppError } from '../src/lib/errors';
import i18n from '../src/lib/i18n';

const mockDelete = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/api', () => ({ deleteAccount: (c: string) => mockDelete(c) }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { username: 'luul' }, signOut: mockSignOut }) }));

beforeEach(async () => {
  mockDelete.mockReset();
  mockSignOut.mockClear();
  await i18n.changeLanguage('pt-BR');
});

describe('Excluir conta', () => {
  test('o botão só libera quando a pessoa digita o próprio @', async () => {
    await render(<DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('delete-confirm'), 'outra');
    expect(screen.getByTestId('delete-account').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('delete-confirm'), '@Luul');
    expect(screen.getByTestId('delete-account').props.accessibilityState.disabled).toBe(false);
  });

  test('exclui e sai da conta', async () => {
    mockDelete.mockResolvedValue(undefined);
    await render(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByTestId('delete-confirm'), 'luul');
    await fireEvent.press(screen.getByTestId('delete-account'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockDelete).toHaveBeenCalledWith('luul');
  });

  test('login antigo: explica e oferece entrar de novo', async () => {
    mockDelete.mockRejectedValue(new AppError('reauth_required'));
    await render(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByTestId('delete-confirm'), 'luul');
    await fireEvent.press(screen.getByTestId('delete-account'));
    await waitFor(() => expect(screen.getByText(/saia, entre de novo/)).toBeTruthy());
    expect(screen.getByText('Sair e entrar de novo')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
