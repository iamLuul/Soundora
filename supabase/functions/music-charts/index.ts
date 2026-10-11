// Edge Function: music-charts
//
// Aba Trending: as mais tocadas no mundo (Last.fm) e o link de cada música na
// plataforma de streaming da pessoa. A chave do Last.fm fica só aqui, como segredo:
//
// Local:  supabase/functions/.env com LASTFM_API_KEY=...  e  npx supabase functions serve
// Nuvem:  npx supabase secrets set LASTFM_API_KEY=...      e  npx supabase functions deploy music-charts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchPlatformLinks, fetchWorldChart, findTrackMeta, LastfmKeyError, type ChartEntry } from '../_shared/links/charts.ts';
import type { FetchLike } from '../_shared/links/preview.ts';
import { apiKey, isDebug } from '../_shared/keys.ts';
import { createHandler, RATE, type Snapshot } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });
const http = fetch as unknown as FetchLike;

const COLUMNS = 'taken_on, fetched_at, entries';

// Do runtime das Edge Functions: mantém a tarefa rodando depois da resposta.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

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
      const { data, error } = await admin.rpc('rate_limit_hit', {
        p_user: userId,
        p_action: `music_charts_${action}`,
        p_max: RATE[action],
        p_window_seconds: 60,
      });
      if (error) throw error;
      return data === true;
    },
    async latestSnapshot() {
      const { data, error } = await admin.from('music_chart_snapshots').select(COLUMNS).order('taken_on', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Snapshot | null;
    },
    async previousSnapshot(today) {
      const weekAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const old = await admin
        .from('music_chart_snapshots')
        .select(COLUMNS)
        .lte('taken_on', weekAgo)
        .order('taken_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (old.error) throw old.error;
      if (old.data) return old.data as Snapshot;
      const first = await admin
        .from('music_chart_snapshots')
        .select(COLUMNS)
        .lt('taken_on', today)
        .order('taken_on', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first.error) throw first.error;
      return first.data as Snapshot | null;
    },
    async saveSnapshot(takenOn, entries: ChartEntry[]) {
      const { error } = await admin.from('music_chart_snapshots').upsert({ taken_on: takenOn, fetched_at: new Date().toISOString(), entries });
      if (error) throw error;
    },
    fetchChart() {
      const key = Deno.env.get('LASTFM_API_KEY');
      if (!key) throw new LastfmKeyError();
      return fetchWorldChart(key, { fetch: http, timeoutMs: 6000, log: console.log });
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
    findMeta: (ref) => findTrackMeta(ref, { fetch: http, timeoutMs: 5000, lastfmKey: Deno.env.get('LASTFM_API_KEY') }),
    background: typeof EdgeRuntime !== 'undefined' ? (task) => EdgeRuntime!.waitUntil(task) : undefined,
  }),
);
