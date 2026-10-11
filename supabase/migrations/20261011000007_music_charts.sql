-- Trending: "Mais tocadas no mundo" (Last.fm) e a plataforma de streaming de cada pessoa.
--
-- 1. A plataforma que a pessoa mais usa (escolhida no cadastro) fica em profile_private:
--    só ela vê. As músicas do Trending abrem sempre nessa plataforma.
-- 2. O ranking e os links por plataforma ficam em cache no banco. Só a Edge Function
--    music-charts (com a chave secreta) lê e grava; o app não tem acesso direto.

alter table public.profile_private
  add column streaming_platform text
  constraint profile_private_streaming_platform_valid
  check (streaming_platform in ('spotify', 'apple_music', 'deezer', 'youtube_music', 'amazon_music', 'tidal', 'soundcloud'));

-- Trocar a plataforma (Configurações, ou quem criou a conta antes de existir a escolha).
create function public.set_streaming_platform(p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.profile_private set streaming_platform = p_platform where user_id = auth.uid();
  if not found then
    raise exception 'not_onboarded' using errcode = 'P0001';
  end if;
exception when check_violation then
  raise exception 'invalid_platform' using errcode = 'P0001';
end $$;
revoke execute on function public.set_streaming_platform(text) from public, anon;
grant execute on function public.set_streaming_platform(text) to authenticated;

-- Cadastro com a plataforma. A versão antiga (sem ela) sai.
drop function public.complete_onboarding(text, text, date, text[], text);
create function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_birthdate date,
  p_genres text[],
  p_locale text default 'pt-BR',
  p_streaming_platform text default null
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.app_config;
  v_age int;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'already_onboarded' using errcode = 'P0001';
  end if;

  select * into cfg from public.app_config;
  v_age := date_part('year', age(current_date, p_birthdate))::int;
  if p_birthdate > current_date or v_age > 120 then
    raise exception 'birthdate_invalid' using errcode = 'P0001';
  end if;
  if v_age < cfg.min_age then
    raise exception 'too_young' using errcode = 'P0001';
  end if;
  if v_age < cfg.guardian_required_under and not cfg.guardian_flow_enabled then
    raise exception 'needs_guardian' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_genres, 1), 0) < 3 then
    raise exception 'genres_too_few' using errcode = 'P0001';
  end if;
  if p_streaming_platform is not null
     and p_streaming_platform not in ('spotify', 'apple_music', 'deezer', 'youtube_music', 'amazon_music', 'tidal', 'soundcloud') then
    raise exception 'invalid_platform' using errcode = 'P0001';
  end if;

  begin
    insert into public.profiles (id, username, display_name, locale)
    values (auth.uid(), lower(trim(p_username)), trim(p_display_name), p_locale)
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;

  insert into public.profile_private (user_id, birthdate, is_minor, streaming_platform)
  values (auth.uid(), p_birthdate, v_age < 18, p_streaming_platform);

  insert into public.user_genres (user_id, genre)
  select auth.uid(), g from unnest(p_genres) as g
  on conflict do nothing;

  return v_profile;
end $$;
revoke execute on function public.complete_onboarding(text, text, date, text[], text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, date, text[], text, text) to authenticated;

-- Fotos do ranking, uma por dia (a de hoje é atualizada a cada poucas horas).
-- As antigas servem para comparar: subiu, caiu ou entrou agora.
create table public.music_chart_snapshots (
  taken_on date primary key,
  fetched_at timestamptz not null default now(),
  entries jsonb not null check (jsonb_typeof(entries) = 'array')
);

-- Links da mesma música em cada plataforma (song.link), por link da Deezer.
create table public.track_platform_links (
  deezer_url text primary key check (deezer_url ~ '^https://www\.deezer\.com/track/[0-9]{1,15}$'),
  links jsonb not null check (jsonb_typeof(links) = 'object'),
  checked_at timestamptz not null default now()
);

alter table public.music_chart_snapshots enable row level security;
alter table public.track_platform_links enable row level security;
revoke all on public.music_chart_snapshots from anon, authenticated;
revoke all on public.track_platform_links from anon, authenticated;

-- Guarda só 60 dias de ranking.
create function private.prune_chart_snapshots() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.music_chart_snapshots where taken_on < current_date - 60;
  return null;
end $$;
create trigger prune_chart_snapshots after insert on public.music_chart_snapshots
  for each statement execute function private.prune_chart_snapshots();
