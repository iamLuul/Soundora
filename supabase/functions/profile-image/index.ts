// Edge Function: profile-image
//
// Única forma de trocar a foto (kind=avatar) e o banner (kind=banner) do perfil e a foto da
// comunidade (kind=community, só a dona). O app manda
// os bytes da imagem (POST) ou pede para remover (DELETE). A função confere login, limite,
// tamanho e o arquivo em si (image.ts) e só então grava no bucket e no perfil, com a chave secreta.
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy profile-image
import { createClient } from 'npm:@supabase/supabase-js@2';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, IMAGE_RATE, KINDS } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });

const COLUMN = { avatar: 'avatar_url', banner: 'banner_url' } as const;

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
    async rateLimit(userId, kind) {
      const { data, error } = await admin.rpc('rate_limit_hit', {
        p_user: userId,
        p_action: `profile_image_${kind}`,
        p_max: IMAGE_RATE.max,
        p_window_seconds: IMAGE_RATE.windowSeconds,
      });
      if (error) throw error;
      return data === true;
    },
    async upload(kind, path, bytes, contentType) {
      const { error } = await admin.storage.from(KINDS[kind].bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: '31536000' });
      if (error) throw error;
    },
    async isCommunityOwner(userId, communityId) {
      const { data, error } = await admin
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data?.role === 'owner';
    },
    async setImage(userId, kind, storedPath, communityId) {
      if (kind === 'community') {
        // A função do banco confere de novo que é a dona e devolve o caminho anterior.
        const { data, error } = await admin.rpc('community_set_avatar', { p_user: userId, p_community: communityId, p_path: storedPath });
        if (error) throw error;
        return (data as string | null) ?? null;
      }
      const column = COLUMN[kind];
      const { data: before, error: readError } = await admin.from('profiles').select(column).eq('id', userId).maybeSingle();
      if (readError) throw readError;
      if (!before) throw new Error('profile_not_found');
      const { error } = await admin.from('profiles').update({ [column]: storedPath }).eq('id', userId);
      if (error) throw error;
      return ((before as Record<string, string | null>)[column]) ?? null;
    },
    async remove(kind, paths) {
      const { error } = await admin.storage.from(KINDS[kind].bucket).remove(paths);
      if (error) throw error;
    },
  }),
);
