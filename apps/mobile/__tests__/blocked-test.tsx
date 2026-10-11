import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BlockedScreen from '../src/app/settings/blocked';
import i18n from '../src/lib/i18n';

const mockUnblock = jest.fn(async (_id: string) => undefined);
const mockList = jest.fn();
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchBlockedProfiles: () => mockList(),
  unblockUser: (id: string) => mockUnblock(id),
}));

async function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <BlockedScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  jest.clearAllMocks();
});

describe('Configurações › Bloqueados', () => {
  test('lista quem eu bloqueei e desbloquear tira da lista', async () => {
    mockList.mockResolvedValue([
      { id: 'u1', username: 'theo.rock', display_name: 'Théo', avatar_url: null },
      { id: 'u2', username: 'bia.ramos', display_name: 'Bia', avatar_url: null },
    ]);
    await wrap();
    await waitFor(() => expect(screen.getByText('Théo')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('unblock-theo.rock'));
    await waitFor(() => expect(screen.queryByText('Théo')).toBeNull());
    expect(mockUnblock).toHaveBeenCalledWith('u1');
    expect(screen.getByText('Bia')).toBeTruthy();
  });

  test('sem ninguém bloqueado', async () => {
    mockList.mockResolvedValue([]);
    await wrap();
    await waitFor(() => expect(screen.getByText('Você não bloqueou ninguém.')).toBeTruthy());
  });
});
