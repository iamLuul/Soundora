// Chaves do Supabase dentro das Edge Functions: lê as chaves novas (JSON de chaves)
// e cai para as chaves legadas, se preciso.
export function apiKey(kind: 'publishable' | 'secret'): string {
  const raw = Deno.env.get(kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const first = Object.values(JSON.parse(raw) as Record<string, string>)[0];
      if (first) return first;
    } catch {
      // segue para a chave legada
    }
  }
  const legacy = Deno.env.get(kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error(`missing ${kind} key`);
  return legacy;
}

/** Fora da nuvem (supabase start), o erro técnico volta na resposta para facilitar o diagnóstico. */
export const isDebug = !Deno.env.get('SB_REGION') || Deno.env.get('SOUNDHORA_DEBUG') === '1';
