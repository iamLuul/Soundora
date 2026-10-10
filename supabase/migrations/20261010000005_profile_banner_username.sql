-- Perfil: banner (capa), troca de @ e resumo com banner e curtidas recebidas.

-- ---------------------------------------------------------------- banner

-- Como a foto: guarda só o caminho no bucket, e só o servidor (Edge Function profile-image) grava.
alter table public.profiles add column banner_url text;
alter table public.profiles add constraint profiles_banner_path
  check (banner_url is null or banner_url ~ ('^banners/' || id::text || '/banner-[0-9]{10,16}\.(jpg|png|webp)$'));

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- 2 MB, só JPEG, PNG e WebP (o banner chega com 1500 px de largura). Sem policies:
    -- abre pela URL pública, ninguém lista nem escreve pelo app.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('banners', 'banners', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ---------------------------------------------------------------- troca de @

alter table public.profiles add column username_changed_at timestamptz;

-- Troca o @ de quem está logado. Uma troca a cada 30 dias, para ninguém se passar por
-- outra pessoa trocando de @ toda hora. Devolve o @ novo.
create function public.change_username(p_username text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_name text := lower(trim(p_username));
  current_name text;
  last_change timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(new_name) < 3 then raise exception 'username_too_short'; end if;
  if char_length(new_name) > 20 then raise exception 'username_too_long'; end if;
  if new_name !~ '^[a-z0-9_.]+$' then raise exception 'username_invalid_chars'; end if;
  if new_name ~ '^\.|\.$|\.\.' then raise exception 'username_invalid_dots'; end if;

  select username, username_changed_at into current_name, last_change
  from public.profiles where id = uid for update;
  if not found then
    raise exception 'not_found';
  end if;
  if current_name = new_name then
    return current_name;
  end if;
  if last_change is not null and last_change > now() - interval '30 days' then
    raise exception 'username_change_too_soon';
  end if;
  if exists (select 1 from public.profiles where username = new_name) then
    raise exception 'username_taken';
  end if;

  update public.profiles set username = new_name, username_changed_at = now() where id = uid;
  return new_name;
exception
  when unique_violation then
    raise exception 'username_taken';
end;
$$;
grant execute on function public.change_username(text) to authenticated;

-- ---------------------------------------------------------------- resumo do perfil

drop function public.profile_summary(text);
create function public.profile_summary(p_username text)
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text, banner_url text,
  followers int, following int, posts int, likes int, is_me boolean, i_follow boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.id, pr.username, pr.display_name, pr.bio, pr.avatar_url, pr.banner_url,
    (select count(*)::int from public.follows f where f.followee_id = pr.id),
    (select count(*)::int from public.follows f where f.follower_id = pr.id),
    (select count(*)::int from public.posts p where p.author_id = pr.id),
    (select coalesce(sum(p.like_count), 0)::int from public.posts p where p.author_id = pr.id),
    pr.id = auth.uid(),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
  from public.profiles pr
  where pr.username = lower(p_username)
    and not public.is_blocked_with(pr.id);
$$;
grant execute on function public.profile_summary(text) to authenticated;
