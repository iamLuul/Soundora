import { FunctionsHttpError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SignInForm, SignUpForm } from '../src/components/auth/AuthForms';
import { authErrorKey } from '../src/lib/auth-errors';
import { parseIdentifier, sendLoginCode, signInWithPassword, signUp } from '../src/lib/auth-flows';
import i18n from '../src/lib/i18n';

const mockAuth = {
  signInWithPassword: jest.fn(),
  signInWithOtp: jest.fn(),
  verifyOtp: jest.fn(),
  signUp: jest.fn(),
  resend: jest.fn(),
  setSession: jest.fn(),
  updateUser: jest.fn(),
};
const mockInvoke = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
  supabaseUrl: 'http://localhost:54321',
}));

/** Resposta de erro da Edge Function, como o supabase-js entrega. */
function functionError(status: number, body: unknown) {
  return new FunctionsHttpError({ status, json: async () => body });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await i18n.changeLanguage('pt-BR');
});

describe('parseIdentifier', () => {
  test('e-mail, @usuário com ou sem arroba, e lixo', () => {
    expect(parseIdentifier(' Raul@Gmail.com ')).toEqual({ kind: 'email', email: 'raul@gmail.com' });
    expect(parseIdentifier('@Luul')).toEqual({ kind: 'username', username: 'luul' });
    expect(parseIdentifier('ana.clara')).toEqual({ kind: 'username', username: 'ana.clara' });
    expect(parseIdentifier('raul@')).toBeNull();
    expect(parseIdentifier('a b')).toBeNull();
    expect(parseIdentifier('')).toBeNull();
  });
});

describe('login', () => {
  test('com e-mail, usa o Supabase Auth direto', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await signInWithPassword({ kind: 'email', email: 'raul@gmail.com' }, 'senha-forte');
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'raul@gmail.com', password: 'senha-forte' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('com @usuário, o servidor faz o login e o app só recebe a sessão', async () => {
    const session = { access_token: 'a', refresh_token: 'r' };
    mockInvoke.mockResolvedValue({ data: { session }, error: null });
    mockAuth.setSession.mockResolvedValue({ error: null });
    await signInWithPassword({ kind: 'username', username: 'luul' }, 'senha-forte');
    expect(mockInvoke).toHaveBeenCalledWith('auth-username', { body: { action: 'password', username: 'luul', password: 'senha-forte' } });
    expect(mockAuth.setSession).toHaveBeenCalledWith(session);
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  test('código por @usuário: o código vai para o e-mail da conta, o app só vê a dica', async () => {
    mockInvoke.mockResolvedValue({ data: { sent: true, email_hint: 'ra•••@gmail.com' }, error: null });
    await expect(sendLoginCode({ kind: 'username', username: 'luul' })).resolves.toBe('ra•••@gmail.com');
    expect(mockInvoke).toHaveBeenCalledWith('auth-username', { body: { action: 'send_code', username: 'luul' } });
  });

  test('código por e-mail não cria conta nova', async () => {
    mockAuth.signInWithOtp.mockResolvedValue({ error: null });
    await sendLoginCode({ kind: 'email', email: 'raul@gmail.com' });
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ email: 'raul@gmail.com', options: { shouldCreateUser: false } });
  });

  test('erros da Edge Function viram mensagens conhecidas', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: functionError(400, { error: 'invalid_credentials' }) });
    const err = await signInWithPassword({ kind: 'username', username: 'luul' }, 'errada').catch((e: unknown) => e);
    expect(authErrorKey(err)).toBe('auth.wrongPassword');

    mockInvoke.mockResolvedValue({ data: null, error: functionError(429, { error: 'rate_limited' }) });
    expect(authErrorKey(await sendLoginCode({ kind: 'username', username: 'luul' }).catch((e: unknown) => e))).toBe('auth.rateLimit');

    mockInvoke.mockResolvedValue({ data: null, error: functionError(404, { error: 'no_account' }) });
    expect(authErrorKey(await sendLoginCode({ kind: 'username', username: 'ninguem' }).catch((e: unknown) => e))).toBe('auth.noAccount');
  });

  test('e-mail sem conta no login por código', () => {
    expect(authErrorKey({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe('auth.noAccount');
    expect(authErrorKey({ message: 'Signups not allowed for otp' })).toBe('auth.noAccount');
  });
});

describe('cadastro', () => {
  test('sem sessão: falta confirmar o código', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    await expect(signUp('novo@soundora.dev', 'senha-forte', 'pt-BR')).resolves.toBe('verify');
  });

  test('e-mail já cadastrado é detectado mesmo com a resposta "sem erro" do Supabase', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const err = await signUp('raul@gmail.com', 'senha-forte', 'pt-BR').catch((e: unknown) => e);
    expect(authErrorKey(err)).toBe('auth.emailExists');
  });
});

describe('<SignUpForm />', () => {
  test('pede senha e confirmação; senhas diferentes não criam a conta', async () => {
    await render(<SignUpForm confirmEmail={null} />);
    await fireEvent.changeText(screen.getByTestId('email-input'), 'novo@soundora.dev');
    await fireEvent.changeText(screen.getByTestId('new-password-input'), 'senha-forte-1');
    await fireEvent.changeText(screen.getByTestId('confirm-password-input'), 'senha-forte-2');
    await fireEvent.press(screen.getByTestId('sign-up'));
    expect(screen.getByText('As senhas não são iguais.')).toBeTruthy();
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  test('cria a conta e pede o código enviado ao e-mail', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    mockAuth.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await render(<SignUpForm confirmEmail={null} />);
    await fireEvent.changeText(screen.getByTestId('email-input'), 'Novo@Soundora.dev');
    await fireEvent.changeText(screen.getByTestId('new-password-input'), 'senha-forte-1');
    await fireEvent.changeText(screen.getByTestId('confirm-password-input'), 'senha-forte-1');
    await fireEvent.press(screen.getByTestId('sign-up'));

    await waitFor(() => expect(screen.getByTestId('code-input')).toBeTruthy());
    expect(mockAuth.signUp).toHaveBeenCalledWith({ email: 'novo@soundora.dev', password: 'senha-forte-1', options: { data: { locale: 'pt-BR' } } });
    expect(screen.getByText('Enviamos um código de 6 dígitos para novo@soundora.dev')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('code-input'), '123456');
    await fireEvent.press(screen.getByTestId('verify-code'));
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: 'novo@soundora.dev', token: '123456', type: 'email' });
  });
});

describe('<SignInForm />', () => {
  test('entrar com @usuário e código: mostra só a dica do e-mail', async () => {
    mockInvoke.mockResolvedValue({ data: { sent: true, email_hint: 'ra•••@gmail.com' }, error: null });
    await render(<SignInForm onUnconfirmed={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('identifier-input'), '@luul');
    await fireEvent.press(screen.getByText('Código por e-mail'));
    await fireEvent.press(screen.getByTestId('send-code'));
    await waitFor(() => expect(screen.getByText('Enviamos um código de 6 dígitos para ra•••@gmail.com')).toBeTruthy());
  });

  test('senha errada mostra a mensagem', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    await render(<SignInForm onUnconfirmed={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'raul@gmail.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'errada-123');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('sign-in'));
    });
    await waitFor(() => expect(screen.getByText(/E-mail, @usuário ou senha incorretos/)).toBeTruthy());
  });

  test('conta não confirmada: reenvia o código e abre a confirmação', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    mockAuth.resend.mockResolvedValue({ error: null });
    const onUnconfirmed = jest.fn();
    await render(<SignInForm onUnconfirmed={onUnconfirmed} />);
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'raul@gmail.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'senha-forte');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('sign-in'));
    });
    await waitFor(() => expect(onUnconfirmed).toHaveBeenCalledWith('raul@gmail.com'));
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'raul@gmail.com' });
  });
});
