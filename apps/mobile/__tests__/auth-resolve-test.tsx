// Entrar não mostra o cadastro (onboarding) por um instante: a sessão e o perfil passam a valer
// juntos. E se o perfil não carregar, a conta não cai no cadastro.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/lib/auth';

type Listener = (event: string, s: unknown) => void;
let mockListener: Listener = () => {};
const sessionOf = (id: string) => ({ user: { id }, access_token: 't' });
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb: Listener) => {
        mockListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
  },
}));
let mockProfile: () => Promise<unknown> = async () => null;
jest.mock('../src/lib/api', () => ({ getMyProfile: () => mockProfile() }));
jest.mock('../src/lib/push', () => ({ disablePush: async () => undefined }));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: () => undefined }));

/** O que o app enxerga a cada render: logado? com perfil? falhou? */
const seen: string[] = [];
function Probe() {
  const { loading, session, profile, profileFailed } = useAuth();
  if (!loading) seen.push(!session ? 'out' : profileFailed ? 'failed' : profile ? 'home' : 'onboarding');
  return null;
}

async function mount() {
  seen.length = 0;
  const qc = new QueryClient();
  await render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

async function signIn(id: string) {
  await act(async () => mockListener('SIGNED_IN', sessionOf(id)));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

test('conta pronta: do login direto para o app, sem passar pelo cadastro', async () => {
  let release: (p: unknown) => void = () => {};
  mockProfile = () => new Promise((r) => (release = r));
  await mount();
  await signIn('ana');
  // Perfil ainda carregando: continua na tela de entrar (nada de cadastro).
  expect(seen).not.toContain('onboarding');
  expect(seen.at(-1)).toBe('out');
  await act(async () => release({ id: 'ana', username: 'ana', locale: 'pt-BR' }));
  expect(seen.at(-1)).toBe('home');
  expect(seen).not.toContain('onboarding');
});

test('conta nova (sem perfil): vai para o cadastro', async () => {
  mockProfile = async () => null;
  await mount();
  await signIn('bia');
  expect(seen.at(-1)).toBe('onboarding');
});

test('perfil não carregou: avisa a falha em vez de abrir o cadastro', async () => {
  mockProfile = async () => {
    throw new Error('Network request failed');
  };
  await mount();
  await signIn('caio');
  expect(seen.at(-1)).toBe('failed');
  expect(seen).not.toContain('onboarding');
});
