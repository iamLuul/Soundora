// Edge Function: media-upload
//
// Única forma de gravar foto e vídeo das Vibes (?for=vibe) e dos posts (?for=post). Confere
// login, limite, tamanho e o arquivo (foto: image.ts do profile-image; vídeo: video.ts) e
// grava no bucket privado do destino ("vibes" ou "post-media").
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy media-upload
import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { BUCKETS, createHandler, UPLOAD_RATE } from './handler.ts';

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
        p_action: 'media_upload',
        p_max: UPLOAD_RATE.max,
        p_window_seconds: UPLOAD_RATE.windowSeconds,
      });
      if (error) throw error;
      return data === true;
    },
    async upload(target, path, bytes, contentType) {
      const { error } = await admin.storage.from(BUCKETS[target]).upload(path, bytes, { contentType, upsert: false, cacheControl: '3600' });
      if (error) throw error;
    },
    async garbage(target, userId) {
      const fn = target === 'vibe' ? 'vibe_media_garbage' : 'post_media_garbage';
      const { data, error } = await admin.rpc(fn, { p_user: userId });
      if (error) throw error;
      return ((data ?? []) as { name: string }[]).map((r) => r.name);
    },
    async remove(target, paths) {
      const { error } = await admin.storage.from(BUCKETS[target]).remove(paths);
      if (error) throw error;
    },
  }),
);
