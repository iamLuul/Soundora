/**
 * true se a chave for secreta (ignora o RLS). Ela nunca pode ir para o app: qualquer
 * pessoa extrai as chaves de um APK ou do código da Web.
 * Chaves novas: "sb_secret_..."; chaves legadas: JWT com role "service_role".
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const json = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: unknown }).role === 'service_role';
  } catch {
    return false;
  }
}
