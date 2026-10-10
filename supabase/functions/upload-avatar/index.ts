// Edge Function: upload-avatar
//
// Única forma de trocar a foto de perfil. O app manda os bytes da imagem (POST) ou pede
// para remover a foto (DELETE). A função confere login, limite, tamanho e o arquivo em si
// (image.ts) e só então grava no bucket avatars e no perfil, com a chave secreta.
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy upload-avatar
import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { AVATAR_RATE, createHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(
  createHandler({
    debug: isDebug,
    async getUserId(authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error) return null;
      return data.user?.id ?? null;
    },
    async rateLimit(userId) {
      const { data, error } = await admin.rpc('rate_limit_hit', {
        p_user: userId,
        p_action: 'avatar',
        p_max: AVATAR_RATE.max,
        p_window_seconds: AVATAR_RATE.windowSeconds,
      });
      if (error) throw error;
      return data === true;
    },
    async upload(path, bytes, contentType) {
      const { error } = await admin.storage.from('avatars').upload(path, bytes, { contentType, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
    },
    async setAvatar(userId, avatarPath) {
      const { data: before, error: readError } = await admin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
      if (readError) throw readError;
      if (!before) throw new Error('profile_not_found');
      const { error } = await admin.from('profiles').update({ avatar_url: avatarPath }).eq('id', userId);
      if (error) throw error;
      return (before.avatar_url as string | null) ?? null;
    },
    async remove(paths) {
      const { error } = await admin.storage.from('avatars').remove(paths);
      if (error) throw error;
    },
  }),
);
