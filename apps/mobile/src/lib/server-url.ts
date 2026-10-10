/**
 * No celular, "localhost" e "127.0.0.1" apontam para o próprio celular, não para o seu PC.
 * Em desenvolvimento, troca esse endereço pelo IP do PC que está rodando o Expo
 * (o mesmo do QR code), para o app achar o Supabase local.
 */
export function resolveServerUrl(
  url: string,
  opts: { platform: string; isDev: boolean; hostUri: string | null | undefined },
): string {
  if (opts.platform === 'web' || !opts.isDev || !opts.hostUri) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return url;
  // hostUri vem como "192.168.0.10:8081" (ou um domínio de túnel do Expo)
  const devHost = opts.hostUri.split('/')[0]?.split(':')[0];
  if (!devHost || devHost === 'localhost' || devHost === '127.0.0.1') return url;
  parsed.hostname = devHost;
  return parsed.toString().replace(/\/$/, '');
}

/** Erro de rede: o app não conseguiu falar com o servidor. */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; message?: unknown; status?: unknown };
  const msg = typeof e.message === 'string' ? e.message : '';
  return (
    e.name === 'AuthRetryableFetchError' ||
    /network request failed|failed to fetch|load failed|networkerror/i.test(msg) ||
    (e.status === 0 && e.name !== undefined)
  );
}
