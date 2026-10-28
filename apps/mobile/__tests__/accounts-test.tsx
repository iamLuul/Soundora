// Várias contas no aparelho: trocar sem sair, adicionar, sair abre a próxima, login vencido.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { listAccounts, parkCurrent, rememberCurrent, setAccountsStorage, tokenOf } from '../src/lib/accounts';
import { AuthProvider, useAuth } from '../src/lib/auth';

type Listener = (event: string, s: unknown) => void;
let mockListener: Listener = () => {};
let mockSession: { user: { id: string }; access_token: string; refresh_token: string } | null = null;
const mockRefresh = jest.fn();
const mockSetSession = jest.fn();
const mockSignOut = jest.fn();
const sessionOf = (id: string, rt = `rt-${id}`) => ({ user: { id }, access_token: `at-${id}`, refresh_token: rt });

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      getUser: async () => ({ data: { user: mockSession?.user ?? null }, error: null }),
      onAuthStateChange: (cb: Listener) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: (...a: unknown[]) => mockSignOut(...a),
      refreshSession: (...a: unknown[]) => mockRefresh(...a),
      setSession: (...a: unknown[]) => mockSetSession(...a),
    },
  },
}));
const profiles: Record<string, { id: string; username: string; display_name: string; avatar_url: null; locale: string }> = {
  ana: { id: 'ana', username: 'ana', display_name: 'Ana', avatar_url: null, locale: 'pt-BR' },
  bia: { id: 'bia', username: 'bia', display_name: 'Bia', avatar_url: null, locale: 'pt-BR' },
  caio: { id: 'caio', username: 'caio', display_name: 'Caio', avatar_url: null, locale: 'pt-BR' },
};
jest.mock('../src/lib/api', () => ({ getMyProfile: async () => (mockSession ? profiles[mockSession.user.id] : null) }));
jest.mock('../src/lib/push', () => ({ disablePush: async () => undefined, enablePush: async () => true, pushEnabled: () => false }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: () => undefined }));

/** Cofre de mentira (o de verdade criptografa no Keychain/Keystore). */
let mem: Record<string, string> = {};
setAccountsStorage({
  getItem: async (k) => mem[k] ?? null,
  setItem: async (k, v) => {
    mem[k] = v;
  },
  removeItem: async (k) => {
    delete mem[k];
  },
});

/** O Supabase avisa que a sessão mudou (como depois de refreshSession/signOut). */
async function emit(s: typeof mockSession) {
  mockSession = s;
  await act(async () => {
    mockListener(s ? 'TOKEN_REFRESHED' : 'SIGNED_OUT', s);
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

let auth: ReturnType<typeof useAuth>;
function Probe() {
  const value = useAuth();
  useEffect(() => {
    auth = value;
  });
  return null;
}
async function mount() {
  const qc = new QueryClient();
  await render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(auth.loading).toBe(false));
}

beforeEach(() => {
  mem = {};
  mockSession = null;
  mockRefresh.mockReset();
  mockSetSession.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
});

describe('cofre de contas', () => {
  test('a conta aberta fica sem token; ao sair dela, guarda o token mais recente', async () => {
    const ana = { userId: 'ana', username: 'ana', displayName: 'Ana', avatarUrl: null };
    await rememberCurrent(ana);
    expect(await tokenOf('ana')).toBeNull();
    await parkCurrent(ana, sessionOf('ana', 'rt-novo') as never);
    expect(await tokenOf('ana')).toBe('rt-novo');
    await rememberCurrent(ana);
    expect(await tokenOf('ana')).toBeNull();
    // A lista não mostra token.
    expect(JSON.stringify(await listAccounts())).not.toContain('rt-');
  });

  test('lixo no cofre não derruba o app', async () => {
    mem['soundora-accounts'] = '{nada';
    expect(await listAccounts()).toEqual([]);
  });
});

describe('trocar de conta', () => {
  test('troca para outra conta salva sem pedir senha, e a anterior fica guardada para voltar', async () => {
    mockSession = sessionOf('bia');
    await mount();
    // Bia "adiciona" a Ana: guarda a Bia e sai só deste aparelho.
    await act(() => auth.addAccount());
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await tokenOf('bia')).toBe('rt-bia');
    await emit(null);
    // Entra na Ana pelo login normal.
    await emit(sessionOf('ana'));
    expect(auth.profile?.username).toBe('ana');
    expect(auth.accounts.map((a) => a.username).sort()).toEqual(['ana', 'bia']);

    // Volta para a Bia com um toque.
    mockRefresh.mockImplementation(async ({ refresh_token }: { refresh_token: string }) => {
      expect(refresh_token).toBe('rt-bia');
      return { data: { session: sessionOf('bia', 'rt-bia-2') }, error: null };
    });
    await act(() => auth.switchAccount('bia'));
    await emit(sessionOf('bia', 'rt-bia-2'));
    expect(auth.profile?.username).toBe('bia');
    // A Ana ficou guardada com o token dela; a Bia (aberta) sem token no cofre.
    expect(await tokenOf('ana')).toBe('rt-ana');
    expect(await tokenOf('bia')).toBeNull();
  });

  test('login da outra conta venceu: ela sai da lista e a conta atual continua', async () => {
    mockSession = sessionOf('ana');
    mem['soundora-accounts'] = JSON.stringify([{ userId: 'bia', username: 'bia', displayName: 'Bia', avatarUrl: null, refreshToken: 'rt-velho' }]);
    await mount();
    mockRefresh.mockImplementation(async () => {
      mockSession = null; // o Supabase pode apagar a sessão atual quando o refresh falha
      return { data: { session: null }, error: { message: 'Invalid Refresh Token' } };
    });
    mockSetSession.mockImplementation(async (s: { refresh_token: string }) => {
      mockSession = sessionOf('ana', s.refresh_token);
      return { data: { session: mockSession }, error: null };
    });
    let failure: unknown;
    await act(async () => {
      await auth.switchAccount('bia').catch((e: unknown) => (failure = e));
    });
    expect(String(failure)).toContain('account_expired');
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'at-ana', refresh_token: 'rt-ana' });
    expect(auth.accounts.map((a) => a.username)).toEqual(['ana']);
  });

  test('sair de uma conta abre a próxima salva; a que saiu some do aparelho', async () => {
    mockSession = sessionOf('ana');
    mem['soundora-accounts'] = JSON.stringify([{ userId: 'caio', username: 'caio', displayName: 'Caio', avatarUrl: null, refreshToken: 'rt-caio' }]);
    await mount();
    mockRefresh.mockResolvedValue({ data: { session: sessionOf('caio', 'rt-caio-2') }, error: null });
    await act(() => auth.signOut());
    expect(mockSignOut).toHaveBeenCalledWith();
    expect(mockRefresh).toHaveBeenCalledWith({ refresh_token: 'rt-caio' });
    await emit(sessionOf('caio', 'rt-caio-2'));
    expect(auth.profile?.username).toBe('caio');
    expect(auth.accounts.map((a) => a.username)).toEqual(['caio']);
  });

  test('no máximo 5 contas no aparelho', async () => {
    mockSession = sessionOf('ana');
    mem['soundora-accounts'] = JSON.stringify(
      ['b', 'c', 'd', 'e'].map((id) => ({ userId: id, username: id, displayName: id, avatarUrl: null, refreshToken: `rt-${id}` })),
    );
    await mount();
    let failure: unknown;
    await act(async () => {
      await auth.addAccount().catch((e: unknown) => (failure = e));
    });
    expect(String(failure)).toContain('too_many_accounts');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
