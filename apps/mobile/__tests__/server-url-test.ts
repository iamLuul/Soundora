import { isNetworkError, resolveServerUrl } from '../src/lib/server-url';

describe('resolveServerUrl', () => {
  const dev = { platform: 'android', isDev: true, hostUri: '192.168.0.10:8081' };

  test('no celular em desenvolvimento, localhost vira o IP do PC', () => {
    expect(resolveServerUrl('http://127.0.0.1:54321', dev)).toBe('http://192.168.0.10:54321');
    expect(resolveServerUrl('http://localhost:54321', { ...dev, platform: 'ios' })).toBe('http://192.168.0.10:54321');
  });

  test('não mexe na Web, em produção ou em endereço da nuvem', () => {
    expect(resolveServerUrl('http://127.0.0.1:54321', { ...dev, platform: 'web' })).toBe('http://127.0.0.1:54321');
    expect(resolveServerUrl('http://127.0.0.1:54321', { ...dev, isDev: false })).toBe('http://127.0.0.1:54321');
    expect(resolveServerUrl('https://abc.supabase.co', dev)).toBe('https://abc.supabase.co');
  });

  test('sem hostUri, mantém o endereço', () => {
    expect(resolveServerUrl('http://127.0.0.1:54321', { ...dev, hostUri: null })).toBe('http://127.0.0.1:54321');
  });
});

describe('isNetworkError', () => {
  test('reconhece falhas de rede do Supabase e do fetch', () => {
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true);
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('Email rate limit exceeded'))).toBe(false);
  });
});
