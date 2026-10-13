// Trocar de conta no mesmo aparelho apaga o cache: a conta nova não vê dados da anterior.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { AuthProvider } from '../src/lib/auth';

type Listener = (event: string, s: unknown) => void;
let mockListener: Listener = () => {};
const sessionOf = (id: string) => ({ user: { id }, access_token: 't' });
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'ana' }, access_token: 't' } } }),
      getUser: async () => ({ data: { user: { id: 'ana' } }, error: null }),
      onAuthStateChange: (cb: Listener) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  },
}));
jest.mock('../src/lib/api', () => ({ getMyProfile: async () => null }));
jest.mock('../src/lib/push', () => ({ disablePush: async () => undefined }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: () => undefined }));

// A sessão nova passa a valer depois de o perfil chegar (callback agendado + busca do perfil).
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });

test('outra conta entra: some o Descobrir da anterior; a mesma conta mantém o cache', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <AuthProvider>{null}</AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockListener).toBeDefined());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  qc.setQueryData(['discover-deck', null], [{ title: 'da Ana' }]);
  // Renovação do token da mesma conta: nada muda.
  await act(async () => mockListener('TOKEN_REFRESHED', sessionOf('ana')));
  await settle();
  expect(qc.getQueryData(['discover-deck', null])).toEqual([{ title: 'da Ana' }]);

  // Saiu e entrou a Bia.
  await act(async () => mockListener('SIGNED_OUT', null));
  await settle();
  expect(qc.getQueryData(['discover-deck', null])).toBeUndefined();
  qc.setQueryData(['discover-liked'], ['curtida da Ana (antiga)']);
  await act(async () => mockListener('SIGNED_IN', sessionOf('bia')));
  await settle();
  expect(qc.getQueryData(['discover-liked'])).toBeUndefined();
});
