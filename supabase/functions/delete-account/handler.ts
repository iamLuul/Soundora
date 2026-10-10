// Lógica da Edge Function delete-account, separada do Deno.serve para poder ser testada
// com o Supabase simulado (handler.test.ts).
//
// Exclui a conta de quem está logado: as fotos dos buckets e o usuário do Supabase Auth.
// O resto (perfil, posts, curtidas, comentários, seguidores, bloqueios, denúncias feitas)
// sai junto pelo "on delete cascade" do banco.
//
// Proteções: login conferido antes de tudo; a pessoa digita o próprio @ para confirmar;
// o login precisa ser recente (sessão roubada ou celular esquecido aberto não basta).
import { readJsonLimited } from '../_shared/body.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** O login precisa ter sido feito nos últimos 30 minutos. */
export const RECENT_LOGIN_MS = 30 * 60 * 1000;
export const BUCKETS = ['avatars', 'banners'] as const;

export interface AuthUser {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
}

export interface Deps {
  getUser(authHeader: string): Promise<AuthUser | null>;
  /** true = dentro do limite. */
  rateLimit(userId: string): Promise<boolean>;
  getUsername(userId: string): Promise<string | null>;
  listFiles(bucket: string, folder: string): Promise<string[]>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  now?: () => number;
  debug?: boolean;
  log?: (...args: unknown[]) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object') return JSON.stringify(err);
  return String(err);
}

export function createHandler(deps: Deps) {
  const log = deps.log ?? console.error;
  const now = deps.now ?? Date.now;

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let user: AuthUser | null = null;
    try {
      user = await deps.getUser(req.headers.get('Authorization') ?? '');
    } catch (err) {
      log('delete-account: falha ao validar o usuário', err);
    }
    if (!user) {
      await req.body?.cancel().catch(() => {});
      return json({ error: 'not_authenticated' }, 401);
    }

    const read = await readJsonLimited(req, 1024);
    if (!read.ok) return json({ error: read.error }, read.error === 'payload_too_large' ? 413 : 400);
    const body = (read.value && typeof read.value === 'object' ? read.value : {}) as { confirm?: unknown };
    const confirm = typeof body.confirm === 'string' ? body.confirm.trim().replace(/^@/, '').toLowerCase() : '';

    try {
      if (!(await deps.rateLimit(user.id))) return json({ error: 'rate_limited' }, 429);

      // Confirmação: o próprio @ (ou o e-mail, para quem ainda não terminou o cadastro).
      const username = await deps.getUsername(user.id);
      const expected = username ?? user.email?.toLowerCase() ?? null;
      if (!expected || confirm !== expected) return json({ error: 'confirmation_mismatch' }, 400);

      const last = user.lastSignInAt ? Date.parse(user.lastSignInAt) : NaN;
      if (!Number.isFinite(last) || now() - last > RECENT_LOGIN_MS) return json({ error: 'reauth_required' }, 403);

      // Arquivos primeiro: o Storage não apaga sozinho quando o usuário some.
      for (const bucket of BUCKETS) {
        const files = await deps.listFiles(bucket, user.id);
        if (files.length) await deps.removeFiles(bucket, files.map((f) => `${user.id}/${f}`));
      }
      await deps.deleteUser(user.id);
      return json({ deleted: true });
    } catch (err) {
      log('delete-account: erro', err);
      return json({ error: 'internal', ...(deps.debug ? { detail: describe(err) } : {}) }, 500);
    }
  };
}
