// Edge Function: vibe-media
//
// Única forma de gravar foto e vídeo das Vibes. Confere login, limite, tamanho e o arquivo
// (foto: image.ts do profile-image; vídeo: video.ts) e grava no bucket privado "vibes".
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy vibe-media
import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, UPLOAD_RATE } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = () => admin.storage.from('vibes');

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
        p_action: 'vibe_upload',
        p_max: UPLOAD_RATE.max,
        p_window_seconds: UPLOAD_RATE.windowSeconds,
      });
      if (error) throw error;
      return data === true;
    },
    async upload(path, bytes, contentType) {
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: false, cacheControl: '3600' });
      if (error) throw error;
    },
    async garbage(userId) {
      const { data, error } = await admin.rpc('vibe_media_garbage', { p_user: userId });
      if (error) throw error;
      return ((data ?? []) as { name: string }[]).map((r) => r.name);
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths);
      if (error) throw error;
    },
  }),
);
