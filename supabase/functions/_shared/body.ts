// Leitura do corpo dos pedidos com limite de tamanho, para nenhuma Edge Function
// carregar na memória um corpo gigante (contra estouro de memória e DDoS barato).

/**
 * Lê o corpo do pedido até `max` bytes e para no meio se passar disso, sem guardar o resto
 * na memória (o header Content-Length pode mentir ou faltar).
 */
export async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | 'too_large'> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return 'too_large';
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** Lê um JSON de no máximo `max` bytes. */
export async function readJsonLimited(req: Request, max: number): Promise<{ ok: true; value: unknown } | { ok: false; error: 'payload_too_large' | 'invalid_body' }> {
  if (Number(req.headers.get('Content-Length') ?? '0') > max) {
    await req.body?.cancel().catch(() => {});
    return { ok: false, error: 'payload_too_large' };
  }
  const bytes = await readLimited(req.body, max);
  if (bytes === 'too_large') return { ok: false, error: 'payload_too_large' };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, error: 'invalid_body' };
  }
}
