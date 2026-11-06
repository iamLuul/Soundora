-- Consentimento de cookies e dados do aparelho (LGPD art. 8º, §2º: cabe ao controlador provar
-- que a pessoa consentiu). Cada escolha da pessoa logada vira uma linha: o que aceitou, a versão
-- do texto e quando. Nada aqui identifica o aparelho (sem IP, sem navegador).
--
-- - Só a própria pessoa grava (pela função, que confere o login) e lê o próprio histórico.
-- - Apagar a conta apaga o histórico junto.

create table public.cookie_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  preferences boolean not null,
  personalization boolean not null,
  version smallint not null check (version between 1 and 1000),
  -- web, android ou ios: em que versão do app a escolha foi feita.
  platform text not null check (platform in ('web', 'android', 'ios')),
  created_at timestamptz not null default now()
);
create index cookie_consents_user on public.cookie_consents (user_id, created_at desc);
alter table public.cookie_consents enable row level security;
create policy "meu histórico de consentimento" on public.cookie_consents for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.cookie_consents from anon, authenticated;

create function public.record_cookie_consent(p_preferences boolean, p_personalization boolean, p_version int, p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_preferences is null or p_personalization is null or p_version is null or p_version not between 1 and 1000
     or p_platform is null or p_platform not in ('web', 'android', 'ios')
     or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not private.hit(uid, 'cookie_consent', 30, interval '1 hour') then
    raise exception 'rate_limited'
      using errcode = 'P0001', detail = coalesce(private.retry_after(uid, 'cookie_consent', interval '1 hour'), 60)::text;
  end if;
  insert into public.cookie_consents (user_id, preferences, personalization, version, platform)
  values (uid, p_preferences, p_personalization, p_version, p_platform);
end;
$$;
revoke execute on function public.record_cookie_consent(boolean, boolean, int, text) from public, anon;
grant execute on function public.record_cookie_consent(boolean, boolean, int, text) to authenticated;
