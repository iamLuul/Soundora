// Edge Function: delete-account
//
// Exclui a conta de quem está logado (veja handler.ts). Exigido pela App Store para apps
// com cadastro e um direito garantido pela LGPD.
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(
  createHandler({
    debug: isDebug,
    async getUser(authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null, lastSignInAt: data.user.last_sign_in_at ?? null };
    },
    async rateLimit(userId) {
      const { data, error } = await admin.rpc('rate_limit_hit', { p_user: userId, p_action: 'delete_account', p_max: 3, p_window_seconds: 3600 });
      if (error) throw error;
      return data === true;
    },
    async getUsername(userId) {
      const { data, error } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle();
      if (error) throw error;
      return (data?.username as string | undefined) ?? null;
    },
    async listFiles(bucket, folder) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
      if (error) throw error;
      return (data ?? []).map((f) => f.name);
    },
    async removeFiles(bucket, paths) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) throw error;
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  }),
);
