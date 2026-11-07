// Peças de HTTP iguais em todas as Edge Functions: cabeçalhos CORS, resposta JSON e o texto do
// erro técnico (que só volta na resposta fora da nuvem, com deps.debug).

/** Cabeçalhos CORS de uma função (o app Web chama de outro endereço). */
export function corsFor(methods = 'POST, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
  };
}

/** Resposta JSON com os cabeçalhos CORS da função. */
export function jsonWith(cors: Record<string, string>) {
  return (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Texto curto de um erro qualquer (Error, objeto do Supabase ou outro valor). */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object') return JSON.stringify(err);
  return String(err);
}
