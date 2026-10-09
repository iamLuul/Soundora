// Edge Function: link-preview
//
// Recebe { url } de uma pessoa logada, gera o cartão de prévia (título,
// artista, capa) e guarda em public.link_previews. O mesmo link já indexado
// nos últimos 7 dias volta do cache, sem nova requisição às plataformas.
//
// Deploy: supabase functions deploy link-preview
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractFirstUrl, parseStreamingUrl } from '../_shared/links/platforms.ts';
import { buildLinkPreview, LinkPreviewError, type FetchLike } from '../_shared/links/preview.ts';

const CACHE_DAYS = 7;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Lê as chaves novas (JSON de chaves) e cai para as chaves legadas, se preciso. */
function apiKey(kind: 'publishable' | 'secret'): string {
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

const STATUS: Record<string, number> = { unsupported: 422, blocked_host: 422, not_found: 404, fetch_failed: 502 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Confere quem está chamando (o gateway já validou o JWT; aqui pegamos o usuário).
  const userClient = createClient(supabaseUrl, apiKey('publishable'), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'not_authenticated' }, 401);

  let input: string | null = null;
  try {
    const body = await req.json();
    input = typeof body?.url === 'string' ? extractFirstUrl(body.url.slice(0, 2048)) : null;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!input) return json({ error: 'unsupported' }, 422);

  const parsed = parseStreamingUrl(input);
  if (!parsed) return json({ error: 'unsupported' }, 422);

  const admin = createClient(supabaseUrl, apiKey('secret'), {
    auth: { persistSession: false },
  });

  // Cache por URL normalizada (links curtos só são conhecidos depois de resolvidos).
  if (!parsed.isShortLink) {
    const { data: cached } = await admin.from('link_previews').select('*').eq('url', parsed.url).maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 86_400_000) {
      return json({ preview: cached, cached: true });
    }
  }

  try {
    const preview = await buildLinkPreview(input, { fetch: fetch as unknown as FetchLike, timeoutMs: 5000 });
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
    return json({ preview: data, cached: false });
  } catch (err) {
    if (err instanceof LinkPreviewError) return json({ error: err.code }, STATUS[err.code] ?? 500);
    console.error('link-preview', err);
    return json({ error: 'internal' }, 500);
  }
});
