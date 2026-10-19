// Edge Function: discover
//
// Descobrir: sugestões de músicas pelo que a pessoa curtiu e pelos gêneros dela (Last.fm),
// com capa, álbum, foto do artista e prévia (Deezer), e o link na plataforma da pessoa.
// Usa a mesma chave do Last.fm do Em alta (LASTFM_API_KEY), só aqui no servidor.
//
// Local:  supabase/functions/.env com LASTFM_API_KEY=...  e  npx supabase functions serve
// Nuvem:  npx supabase functions deploy discover
import { createClient } from 'npm:@supabase/supabase-js@2';
import { chartKey, fetchLastfmTrackInfo, fetchPlatformTracks, isStreamingChoice, LastfmKeyError } from '../_shared/links/charts.ts';
import { deezerAlbumById, deezerAlbumGenres, deezerTrackById, findDeezerTrack, recommend, searchDeezerAlbums, searchDeezerTracks } from '../_shared/links/discover.ts';
import { isAllowedAudioUrl, sameTrack } from '../_shared/links/genres.ts';
import { buildLinkPreview, type FetchLike } from '../_shared/links/preview.ts';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, RATE, type LastfmMeta, type PlatformTrack, type TrackRow } from './handler.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });
const http = fetch as unknown as FetchLike;
const opts = { fetch: http, timeoutMs: 5000 };

const TRACK_COLUMNS = 'id, url, platform, provider_id, title, artist, album, image_url, artist_image_url, audio_url, genres, store_checked_at, store_genre_ids';

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
      const [genres, swipes, muted] = await Promise.all([
        admin.from('user_genres').select('genre').eq('user_id', userId),
        admin
          .from('discover_swipes')
          .select('liked, created_at, link_previews(id, title, artist)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1000),
        admin.from('muted_genres').select('genre').eq('user_id', userId),
      ]);
      if (genres.error) throw genres.error;
      if (muted.error) throw muted.error;
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
        mutedGenres: muted.data.map((g) => g.genre as string),
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
    searchAlbums: (query) => searchDeezerAlbums(query, opts),
    albumById: (id) => deezerAlbumById(id, opts),
    searchTracks: (query) => searchDeezerTracks(query, opts),
    async saveSong(track) {
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
          },
          { onConflict: 'url' },
        )
        .select('id, url, platform, title, artist, image_url')
        .single();
      if (error) throw error;
      return data as { id: string; url: string; platform: string; title: string; artist: string | null; image_url: string | null };
    },
    async saveAlbum(album) {
      const { data, error } = await admin
        .from('link_previews')
        .upsert(
          {
            url: album.url,
            platform: 'deezer',
            kind: 'album',
            provider_id: album.id,
            title: album.title,
            artist: album.artist,
            image_url: album.imageUrl,
            release_date: album.releaseDate,
          },
          { onConflict: 'url' },
        )
        .select('id, url, platform, kind, title, artist, image_url, release_date')
        .single();
      if (error) throw error;
      const row = data as { id: string; url: string; platform: string; kind: string; title: string; artist: string | null; image_url: string | null; release_date: string | null };
      return { ...row, release_year: row.release_date ? Number(row.release_date.slice(0, 4)) : null };
    },
    trackById: (id) => deezerTrackById(id, opts),
    albumGenres: (albumId) => deezerAlbumGenres(albumId, opts),
    async saveGenreIds(previewId, ids) {
      const { error } = await admin.from('link_previews').update({ store_genre_ids: ids }).eq('id', previewId);
      if (error) throw error;
    },
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
      const { data, error } = await admin.from('track_platform_links').select('links, images, checked_at').eq('source_url', sourceUrl).maybeSingle();
      if (error) throw error;
      return data;
    },
    async saveLinks(sourceUrl, links, images) {
      const { error } = await admin.from('track_platform_links').upsert({ source_url: sourceUrl, links, images: images ?? null, checked_at: new Date().toISOString() });
      if (error) throw error;
    },
    // Chave do song.link (opcional): sem ela, o limite é de ~10 pedidos por minuto.
    fetchLinks: (sourceUrl) => fetchPlatformTracks(sourceUrl, { fetch: http, timeoutMs: 6000, apiKey: Deno.env.get('SONGLINK_API_KEY') }),
    background: typeof EdgeRuntime !== 'undefined' ? (task) => EdgeRuntime!.waitUntil(task) : undefined,
    async lastfmInfo(ref) {
      const key = Deno.env.get('LASTFM_API_KEY');
      if (!key) throw new LastfmKeyError();
      return fetchLastfmTrackInfo(key, ref, opts);
    },
    async findLastfm(ids) {
      const map = new Map<string, LastfmMeta>();
      if (!ids.length) return map;
      const { data, error } = await admin.from('lastfm_tracks').select('link_preview_id, found, title, artist, album, image_url, checked_at').in('link_preview_id', ids);
      if (error) throw error;
      for (const r of data as (LastfmMeta & { link_preview_id: string })[]) map.set(r.link_preview_id, r);
      return map;
    },
    async saveLastfm(id, m) {
      const https = (u: string | null) => (u && u.startsWith('https://') ? u : null);
      const { error } = await admin.from('lastfm_tracks').upsert({
        link_preview_id: id,
        found: m.found,
        title: m.title,
        artist: m.artist,
        album: m.album,
        image_url: https(m.image_url),
        checked_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    async platformOf(userId) {
      const { data, error } = await admin.from('profile_private').select('streaming_platform').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return isStreamingChoice(data?.streaming_platform) ? data.streaming_platform : null;
    },
    async findPlatformTracks(ids, platform) {
      const map = new Map<string, PlatformTrack>();
      if (!ids.length) return map;
      const { data, error } = await admin
        .from('platform_tracks')
        .select('link_preview_id, found, url, image_url, audio_url, checked_at')
        .eq('platform', platform)
        .in('link_preview_id', ids);
      if (error) throw error;
      for (const r of data as (PlatformTrack & { link_preview_id: string })[]) map.set(r.link_preview_id, r);
      return map;
    },
    async savePlatformTrack(id, platform, t) {
      const https = (u: string | null) => (u && u.startsWith('https://') ? u : null);
      const { error } = await admin.from('platform_tracks').upsert({
        link_preview_id: id,
        platform,
        found: t.found,
        url: https(t.url),
        image_url: https(t.image_url),
        audio_url: isAllowedAudioUrl(t.audio_url) ? t.audio_url : null,
        checked_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    // A mesma música na Apple (iTunes Search, sem chave): link, capa (600 px) e prévia oficiais.
    async appleTrack(ref) {
      const term = `${ref.artist} ${ref.title}`.slice(0, 200);
      const res = await http(`https://itunes.apple.com/search?entity=song&limit=5&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(5000) });
      if (res.status === 403 || res.status === 429) return 'quota';
      if (!res.ok) throw new Error(`itunes ${res.status}`);
      type Song = { trackName?: unknown; artistName?: unknown; trackViewUrl?: unknown; artworkUrl100?: unknown; previewUrl?: unknown };
      const body = JSON.parse(await res.text()) as { results?: Song[] };
      const song = (body.results ?? []).find((r) => sameTrack(ref, { title: r.trackName, artist: r.artistName }));
      if (!song || typeof song.trackViewUrl !== 'string') return null;
      const art = typeof song.artworkUrl100 === 'string' ? song.artworkUrl100.replace('100x100bb', '600x600bb') : null;
      return {
        url: song.trackViewUrl,
        imageUrl: art?.startsWith('https://') ? art : null,
        previewUrl: isAllowedAudioUrl(song.previewUrl) ? song.previewUrl : null,
      };
    },
    // Capa oficial do link da plataforma (oEmbed/og, a mesma leitura do cartão de um post).
    async coverOf(url) {
      const preview = await buildLinkPreview(url, { fetch: http, timeoutMs: 5000 });
      return preview.imageUrl;
    },
  }),
);
