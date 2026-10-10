import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { avatarPathFromUrl } from '../src/lib/api';
import { authErrorKey } from '../src/lib/auth-errors';
import { AppError, errorMessageKey } from '../src/lib/errors';
import { useUsernameStatus, validateUsernameFormat } from '../src/lib/username';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

const mockCheck = jest.fn<Promise<boolean>, [string]>();
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  checkUsernameAvailable: (u: string) => mockCheck(u),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('validateUsernameFormat', () => {
  test('normaliza e aceita', () => expect(validateUsernameFormat(' Raul_2 ')).toEqual({ ok: true, username: 'raul_2' }));
  test('motivo do erro vira chave de tradução', () => {
    expect(validateUsernameFormat('ab')).toEqual({ ok: false, reason: 'username_too_short' });
    expect(validateUsernameFormat('com espaço')).toEqual({ ok: false, reason: 'username_invalid_chars' });
  });
});

describe('useUsernameStatus (checagem enquanto digita)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCheck.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  test('formato inválido aparece na hora, sem consultar o banco', async () => {
    const { result } = await renderHook(() => useUsernameStatus('a b'), { wrapper });
    expect(result.current).toEqual({ state: 'invalid', reason: 'username_invalid_chars' });
    expect(mockCheck).not.toHaveBeenCalled();
  });

  test('username livre: "verificando" e depois "disponível"', async () => {
    mockCheck.mockResolvedValue(true);
    const { result } = await renderHook(() => useUsernameStatus('raul'), { wrapper });
    expect(result.current.state).toBe('checking');
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    await waitFor(() => expect(result.current).toEqual({ state: 'available', username: 'raul' }));
    expect(mockCheck).toHaveBeenCalledWith('raul');
  });

  test('username ocupado', async () => {
    mockCheck.mockResolvedValue(false);
    const { result } = await renderHook(() => useUsernameStatus('luul'), { wrapper });
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    await waitFor(() => expect(result.current).toEqual({ state: 'taken', username: 'luul' }));
  });

  test('espera parar de digitar antes de consultar', async () => {
    mockCheck.mockResolvedValue(true);
    // O campo começa vazio, como na tela; a pessoa digita "rau" e logo depois "raul".
    const { rerender } = await renderHook(({ v }: { v: string }) => useUsernameStatus(v), { wrapper, initialProps: { v: '' } });
    await rerender({ v: 'rau' });
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    await rerender({ v: 'raul' });
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
    expect(mockCheck).toHaveBeenCalledWith('raul');
  });
});

describe('authErrorKey', () => {
  test('senha errada, e-mail já cadastrado, limite e rede', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('auth.wrongPassword');
    expect(authErrorKey({ code: 'user_already_exists' })).toBe('auth.emailExists');
    expect(authErrorKey({ message: 'Email rate limit exceeded' })).toBe('auth.rateLimit');
    expect(authErrorKey({ name: 'AuthRetryableFetchError', message: 'Network request failed' })).toBe('auth.networkError');
    expect(authErrorKey({ message: 'algo novo' })).toBe('common.error');
  });
});

describe('erros do app', () => {
  test('erro desconhecido da Edge Function vira genérico (nunca mostra a chave crua)', () => {
    expect(errorMessageKey(new AppError('internal', 'HTTP 500'))).toBe('errors.generic');
    expect(errorMessageKey(new AppError('preview_unavailable'))).toBe('errors.preview_unavailable');
  });
});

describe('avatarPathFromUrl', () => {
  test('extrai o caminho dentro do bucket', () => {
    expect(avatarPathFromUrl('http://192.168.0.10:54321/storage/v1/object/public/avatars/u1/avatar-1.jpg?v=2')).toBe('u1/avatar-1.jpg');
    expect(avatarPathFromUrl('https://x.supabase.co/storage/v1/object/public/outro/u1/a.jpg')).toBeNull();
    expect(avatarPathFromUrl(null)).toBeNull();
  });
});
