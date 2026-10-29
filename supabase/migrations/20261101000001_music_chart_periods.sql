-- Trending: mais ouvidas da semana (7 dias), do mês (30 dias) e do ano (360 dias).
--
-- 1. As fotos diárias do ranking do Last.fm passam a ficar 360 dias (antes, 60).
-- 2. A conta de cada período é feita aqui (pontos por posição em cada dia: a 1ª ganha 50, a 50ª
--    ganha 1, quem não estava, 0; desempate por dias no ranking e melhor posição). Só a Edge
--    Function music-charts (chave secreta) pode chamar; o app não lê a tabela nem a função.
-- 3. Uma tarefa agendada (pg_cron) tira a foto uma vez por dia, mesmo que ninguém abra o
--    Trending: chama a Edge Function music-charts-daily com um segredo guardado no Vault.
--    Para ligar na nuvem (uma vez):
--      select vault.create_secret('https://<projeto>.supabase.co', 'project_url');
--      select vault.create_secret('<segredo com 32+ caracteres>', 'charts_cron_secret');
--      npx supabase secrets set CHARTS_CRON_SECRET=<o mesmo segredo>
--    Sem esses segredos, a tarefa roda e não faz nada.

create or replace function private.prune_chart_snapshots() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.music_chart_snapshots where taken_on < current_date - 365;
  return null;
end $$;

-- Busca do link de uma música do mês/ano que já saiu do ranking de hoje (entries @> [{key}]).
create index music_chart_snapshots_entries on public.music_chart_snapshots using gin (entries jsonb_path_ops);

create function public.music_chart_ranking(p_from date, p_to date, p_size int default 50)
returns table (key text, points bigint, days int, best int, entry jsonb)
language sql stable security definer set search_path = '' as $$
  with e as (
    select s.taken_on, x.value as entry, x.value ->> 'key' as key, (x.value ->> 'position')::int as pos
    from public.music_chart_snapshots s
    cross join lateral jsonb_array_elements(s.entries) x
    where s.taken_on between p_from and p_to
      and x.value ? 'key' and x.value ? 'position'
  ),
  agg as (
    select e.key,
           sum(greatest(0, 51 - e.pos))::bigint as points,
           count(distinct e.taken_on)::int as days,
           min(e.pos) as best,
           (array_agg(e.entry order by e.taken_on desc))[1] as entry
    from e
    group by e.key
  )
  select a.key, a.points, a.days, a.best, a.entry
  from agg a
  order by a.points desc, a.days desc, a.best asc, a.key asc
  limit least(greatest(p_size, 1), 100);
$$;
revoke execute on function public.music_chart_ranking(date, date, int) from public, anon, authenticated;
grant execute on function public.music_chart_ranking(date, date, int) to service_role;

-- Chamada da tarefa diária: pede à Edge Function a foto do dia. Sem Vault, pg_net ou os
-- segredos (ambiente local, testes), não faz nada.
create function private.record_music_chart() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'project_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'charts_cron_secret';
  if v_url is null or v_secret is null or length(v_secret) < 32 then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
    using rtrim(v_url, '/') || '/functions/v1/music-charts-daily',
          '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret);
end $$;
revoke execute on function private.record_music_chart() from public, anon, authenticated;

-- Todo dia às 06:17 UTC (03:17 em Brasília), onde o pg_cron existir (Supabase local e nuvem).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('soundhora-music-chart-daily', '17 6 * * *', 'select private.record_music_chart()');
  end if;
end $$;
