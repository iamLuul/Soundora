// Edge Function: music-charts-daily
//
// Tira a foto diária do ranking do Last.fm (as contas de semana, mês e ano do Trending usam essas
// fotos). Quem chama é a tarefa agendada do banco (pg_cron, migração music_chart_periods), uma vez
// por dia, com o segredo no cabeçalho x-cron-secret. Sem o segredo certo: 403.
//
// Nuvem: npx supabase secrets set CHARTS_CRON_SECRET=<o mesmo valor guardado no Vault>
//        npx supabase functions deploy music-charts-daily
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchWorldChart, LastfmKeyError, type ChartEntry } from '../_shared/links/charts.ts';
import type { FetchLike } from '../_shared/links/preview.ts';
import { apiKey } from '../_shared/keys.ts';
import { createDailyHandler, type Snapshot } from '../music-charts/handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } });
const http = fetch as unknown as FetchLike;

Deno.serve(
  createDailyHandler({
    secret: Deno.env.get('CHARTS_CRON_SECRET'),
    async latestSnapshot() {
      const { data, error } = await admin.from('music_chart_snapshots').select('taken_on, fetched_at, entries').order('taken_on', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Snapshot | null;
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
  }),
);
