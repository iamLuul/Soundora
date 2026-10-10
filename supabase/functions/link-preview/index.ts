// Edge Function: link-preview
//
// Recebe { url } de uma pessoa logada, gera o cartão de prévia (título,
// artista, capa) e guarda em public.link_previews. O mesmo link já indexado
// nos últimos 7 dias volta do cache, sem nova requisição às plataformas.
//
// Local:  npx supabase functions serve
// Deploy: npx supabase functions deploy link-preview
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { FetchLike } from '../_shared/links/preview.ts';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, type PreviewRow } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(
  createHandler({
    debug: isDebug,
    fetch: fetch as unknown as FetchLike,
    async getUserId(authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error) throw error;
      return data.user?.id ?? null;
    },
    async findPreview(url) {
      const { data, error } = await admin.from('link_previews').select('*').eq('url', url).maybeSingle();
      if (error) throw error;
      return data as PreviewRow | null;
    },
    async savePreview(preview) {
      const { data, error } = await admin
        .from('link_previews')
        .upsert(
          {
            url: preview.url,
            platform: preview.platform,
            kind: preview.kind,
            provider_id: preview.providerId,
            title: preview.title,
            artist: preview.artist,
            image_url: preview.imageUrl?.startsWith('https://') ? preview.imageUrl : null,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'url' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as PreviewRow;
    },
  }),
);
