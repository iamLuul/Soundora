// Edge Function: discover
//
// Descobrir: sugestões de músicas pelo que a pessoa curtiu e pelos gêneros dela (Last.fm),
// com capa, álbum, foto do artista e prévia (Deezer), e o link na plataforma da pessoa.
// Usa a mesma chave do Last.fm do Em alta (LASTFM_API_KEY), só aqui no servidor.
//
// Local:  supabase/functions/.env com LASTFM_API_KEY=...  e  npx supabase functions serve
// Nuvem:  npx supabase functions deploy discover
import { createClient } from 'npm:@supabase/supabase-js@2';
import { chartKey, fetchPlatformLinks, LastfmKeyError } from '../_shared/links/charts.ts';
import { deezerTrackById, findDeezerTrack, recommend } from '../_shared/links/discover.ts';
import { isAllowedAudioUrl } from '../_shared/links/genres.ts';
import type { FetchLike } from '../_shared/links/preview.ts';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, RATE, type TrackRow } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });
const http = fetch as unknown as FetchLike;
const opts = { fetch: http, timeoutMs: 5000 };

const TRACK_COLUMNS = 'id, url, platform, provider_id, title, artist, album, image_url, artist_image_url, audio_url, genres, store_checked_at';

Deno.serve(
  createHandler({
    debug: isDebug,
    async getUserId(authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error) throw error;
      return data.user?.id ?? null;
    },
    async rateLimit(userId, action) {
      const { data, error } = await admin.rpc('rate_limit_hit', { p_user: userId, p_action: `discover_${action}`, p_max: RATE[action], p_window_seconds: 60 });
      if (error) throw error;
      return data === true;
    },
    async seeds(userId) {
      const [genres, swipes] = await Promise.all([
        admin.from('user_genres').select('genre').eq('user_id', userId),
        admin
          .from('discover_swipes')
          .select('liked, created_at, link_previews(id, title, artist)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);
      if (genres.error) throw genres.error;
      if (swipes.error) throw swipes.error;
      type Swipe = { liked: boolean; link_previews: { id: string; title: string; artist: string | null } | null };
      const rows = (swipes.data as unknown as Swipe[]).filter((s) => s.link_previews);
      return {
        genres: genres.data.map((g) => g.genre as string),
        liked: rows
          .filter((s) => s.liked && s.link_previews!.artist)
          .slice(0, 20)
          .map((s) => ({ title: s.link_previews!.title, artist: s.link_previews!.artist! })),
        seenKeys: rows.map((s) => chartKey(s.link_previews!.artist ?? '', s.link_previews!.title)),
        seenPreviewIds: rows.map((s) => s.link_previews!.id),
      };
    },
    recommend(seeds, size, onlyGenre) {
      const key = Deno.env.get('LASTFM_API_KEY');
      if (!key) throw new LastfmKeyError();
      return recommend(key, seeds, { ...opts, size, onlyGenre });
    },
    async lookup(keys) {
      const map = new Map<string, TrackRow | null>();
      if (!keys.length) return map;
      const { data, error } = await admin.from('track_lookups').select(`key, link_previews(${TRACK_COLUMNS})`).in('key', keys);
      if (error) throw error;
      for (const r of data as unknown as { key: string; link_previews: TrackRow | null }[]) map.set(r.key, r.link_previews);
      return map;
    },
    findTrack: (ref) => findDeezerTrack(ref, opts),
    trackById: (id) => deezerTrackById(id, opts),
    async saveTrack(key, track, genre) {
      let row: TrackRow | null = null;
      if (track) {
        const { data, error } = await admin
          .from('link_previews')
          .upsert(
            {
              url: track.url,
              platform: 'deezer',
              kind: 'track',
              provider_id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              image_url: track.imageUrl,
              artist_image_url: track.artistImageUrl,
              audio_url: isAllowedAudioUrl(track.previewUrl) ? track.previewUrl : null,
              store_checked_at: new Date().toISOString(),
              ...(genre ? { genres: [genre] } : {}),
            },
            { onConflict: 'url' },
          )
          .select(TRACK_COLUMNS)
          .single();
        if (error) throw error;
        row = data as TrackRow;
      }
      const { error } = await admin.from('track_lookups').upsert({ key, link_preview_id: row?.id ?? null, checked_at: new Date().toISOString() });
      if (error) throw error;
      return row;
    },
    async saveAudio(previewId, audioUrl) {
      const { error } = await admin
        .from('link_previews')
        .update({ audio_url: isAllowedAudioUrl(audioUrl) ? audioUrl : null, store_checked_at: new Date().toISOString() })
        .eq('id', previewId);
      if (error) throw error;
    },
    async getTrack(previewId) {
      const { data, error } = await admin.from('link_previews').select(TRACK_COLUMNS).eq('id', previewId).maybeSingle();
      if (error) throw error;
      return data as TrackRow | null;
    },
    async findLinks(sourceUrl) {
      const { data, error } = await admin.from('track_platform_links').select('links, checked_at').eq('source_url', sourceUrl).maybeSingle();
      if (error) throw error;
      return data;
    },
    async saveLinks(sourceUrl, links) {
      const { error } = await admin.from('track_platform_links').upsert({ source_url: sourceUrl, links, checked_at: new Date().toISOString() });
      if (error) throw error;
    },
    fetchLinks: (sourceUrl) => fetchPlatformLinks(sourceUrl, { fetch: http, timeoutMs: 6000 }),
  }),
);
