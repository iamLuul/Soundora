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
    async ranking(from, to) {
      // A conta é feita no banco (public.music_chart_ranking), sem trazer 360 dias de fotos.
      const [rows, count] = await Promise.all([
        admin.rpc('music_chart_ranking', { p_from: from, p_to: to }),
        admin.from('music_chart_snapshots').select('taken_on', { count: 'exact', head: true }).gte('taken_on', from).lte('taken_on', to),
      ]);
      if (rows.error) throw rows.error;
      if (count.error) throw count.error;
      const entries = ((rows.data ?? []) as { entry: ChartEntry }[]).map((r, i) => ({ ...r.entry, position: i + 1 }));
      return { entries, days: count.count ?? 0 };
    },
    async findEntry(key) {
      const { data, error } = await admin
        .from('music_chart_snapshots')
        .select('entries')
        .contains('entries', [{ key }])
        .order('taken_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return ((data?.entries ?? []) as ChartEntry[]).find((e) => e.key === key) ?? null;
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
