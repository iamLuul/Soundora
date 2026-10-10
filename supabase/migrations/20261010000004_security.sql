-- Endurecimento de segurança.
--
-- 1. Visitante sem login (papel anon, a chave pública) não lê nem chama nada.
-- 2. Ninguém do app apaga tabelas inteiras (TRUNCATE ignora o RLS) nem cria triggers.
-- 3. Funções só rodam para quem está logado, e as novas nascem fechadas.
-- 4. Consultas longas são cortadas (contra consultas pesadas em massa).
-- 5. Limite de ações por pessoa (posts, comentários, curtidas, seguir, denúncias...).
-- 6. Fotos de perfil: o app não escreve direto no Storage; a Edge Function upload-avatar
--    confere o arquivo e grava. O perfil guarda só o caminho do arquivo, não uma URL livre.

-- ---------------------------------------------------------------- 1, 2 e 3: privilégios

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- O que o app logado pode chamar.
grant execute on function
  public.is_admin(),
  public.is_blocked_with(uuid),
  public.complete_onboarding(text, text, date, text[], text),
  public.feed_for_you(int, int),
  public.profile_posts(uuid, timestamptz, int),
  public.profile_summary(text),
  public.search_profiles(text, int),
  public.discover_cards(int),
  public.discover_swipe(uuid, boolean, uuid),
  public.trending_tracks(int, text, int),
  public.search_tracks(text, int),
  public.username_available(text)
to authenticated;

-- O que só o servidor (Edge Functions, com a chave secreta) chama.
grant execute on function public.login_lookup(text), public.login_attempts_recent(text, text, int, boolean) to service_role;

-- Tabelas e funções criadas daqui para frente nascem fechadas: cada uma precisa de grant explícito.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- O EXECUTE para todos (PUBLIC) é um padrão global do Postgres: só sai sem "in schema".
alter default privileges revoke execute on functions from public;

-- Policies de leitura valem só para quem está logado (antes valiam para "public").
alter policy "config é pública" on public.app_config to authenticated;
alter policy "gêneros são públicos" on public.genres to authenticated;
alter policy "perfis visíveis" on public.profiles to authenticated;
alter policy "gêneros dos perfis são públicos" on public.user_genres to authenticated;
alter policy "seguidores são públicos" on public.follows to authenticated;
alter policy "prévias são públicas" on public.link_previews to authenticated;
alter policy "posts visíveis" on public.posts to authenticated;
alter policy "curtidas são públicas" on public.likes to authenticated;
alter policy "comentários visíveis" on public.comments to authenticated;
alter policy "destaques ativos são públicos" on public.featured to authenticated;

-- ---------------------------------------------------------------- 4: tempo máximo por consulta

alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';

-- ---------------------------------------------------------------- 5: limite de ações

-- Schema fora da API: o app não enxerga nada daqui.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.rate_events (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_lookup on private.rate_events (user_id, action, created_at desc);

-- Registra uma ação e diz se ainda está dentro do limite (false = passou do limite).
create function private.hit(p_user uuid, p_action text, p_max int, p_window interval)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
begin
  -- Uma ação de cada vez por pessoa e tipo, para cliques simultâneos não furarem o limite.
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_action));
  delete from private.rate_events where user_id = p_user and action = p_action and created_at < now() - p_window;
  select count(*) into recent from private.rate_events where user_id = p_user and action = p_action;
  if recent >= p_max then
    return false;
  end if;
  insert into private.rate_events (user_id, action) values (p_user, p_action);
  return true;
end;
$$;
revoke execute on function private.hit(uuid, text, int, interval) from public;

-- Trigger genérico: tg_rate_limit('acao', 'maximo', 'janela').
create function private.tg_rate_limit()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  -- Sem pessoa logada = servidor (chave secreta) ou manutenção: sem limite.
  if uid is null then
    return new;
  end if;
  if not private.hit(uid, tg_argv[0], tg_argv[1]::int, tg_argv[2]::interval) then
    raise exception 'rate_limited' using hint = tg_argv[0];
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_rate_limit() from public;

create trigger rate_limit before insert on public.posts
  for each row execute function private.tg_rate_limit('post', '30', '1 hour');
create trigger rate_limit before insert on public.comments
  for each row execute function private.tg_rate_limit('comment', '60', '10 minutes');
create trigger rate_limit before insert on public.likes
  for each row execute function private.tg_rate_limit('like', '300', '1 hour');
create trigger rate_limit before insert on public.follows
  for each row execute function private.tg_rate_limit('follow', '100', '1 hour');
create trigger rate_limit before insert on public.reports
  for each row execute function private.tg_rate_limit('report', '20', '1 day');
create trigger rate_limit before insert on public.blocks
  for each row execute function private.tg_rate_limit('block', '50', '1 day');
create trigger rate_limit before insert or update on public.discover_swipes
  for each row execute function private.tg_rate_limit('swipe', '600', '1 hour');
create trigger rate_limit before update on public.profiles
  for each row execute function private.tg_rate_limit('profile_update', '30', '1 hour');
create trigger rate_limit before insert or delete on public.user_genres
  for each row execute function private.tg_rate_limit('genres', '200', '1 hour');

-- Para as Edge Functions (link-preview, upload-avatar) usarem o mesmo controle.
create function public.rate_limit_hit(p_user uuid, p_action text, p_max int, p_window_seconds int)
returns boolean
language sql security definer set search_path = '' as $$
  select private.hit(p_user, p_action, p_max, make_interval(secs => p_window_seconds));
$$;
revoke execute on function public.rate_limit_hit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(uuid, text, int, int) to service_role;

-- ---------------------------------------------------------------- 6: fotos de perfil

-- O perfil guarda o caminho no bucket (avatars/{id}/avatar-123.jpg); o app monta a URL.
-- Assim ninguém aponta a foto para um site de fora, e só a Edge Function muda a foto.
alter table public.profiles drop constraint profiles_avatar_url_own_folder;
update public.profiles
  set avatar_url = regexp_replace(split_part(avatar_url, '?', 1), '^.*/storage/v1/object/public/', '')
  where avatar_url is not null;
update public.profiles
  set avatar_url = null
  where avatar_url is not null and avatar_url !~ ('^avatars/' || id::text || '/avatar-[0-9]{10,16}\.(jpg|png|webp)$');
alter table public.profiles add constraint profiles_avatar_path
  check (avatar_url is null or avatar_url ~ ('^avatars/' || id::text || '/avatar-[0-9]{10,16}\.(jpg|png|webp)$'));
revoke update (avatar_url) on public.profiles from authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- 1 MB, só JPEG, PNG e WebP (a foto chega com 512 px, uns 100 KB).
    update storage.buckets
      set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'avatars';
    -- Sem escrita pelo app: só a Edge Function upload-avatar (chave secreta) grava e apaga.
    -- Sem policy de leitura: a foto abre pela URL pública, mas ninguém lista o bucket.
    drop policy if exists "avatar: enviar na minha pasta" on storage.objects;
    drop policy if exists "avatar: trocar o meu" on storage.objects;
    drop policy if exists "avatar: apagar o meu" on storage.objects;
  end if;
end $$;
