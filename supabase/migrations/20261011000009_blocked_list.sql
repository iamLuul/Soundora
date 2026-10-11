-- Bloqueados: lista para desbloquear (Configurações) e quem eu bloqueei aparece na busca,
-- marcado como bloqueado, para dar para desbloquear por lá também.
--
-- Quem ME bloqueou continua sumido da minha busca (como antes): não dá para saber que fui
-- bloqueado nem achar a pessoa.

-- A busca passa a devolver só os campos públicos do cartão + se fui eu que bloqueei.
drop function public.search_profiles(text, int);
create function public.search_profiles(p_query text, p_limit int default 20)
returns table (id uuid, username text, display_name text, avatar_url text, blocked_by_me boolean)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url,
         exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = pr.id)
  from public.profiles pr
  where auth.uid() is not null
    and char_length(trim(p_query)) >= 2
    and (pr.username operator(extensions.%) lower(p_query) or pr.display_name operator(extensions.%) p_query
         or pr.username ilike lower(p_query) || '%' or pr.display_name ilike '%' || p_query || '%')
    and not exists (select 1 from public.blocks b where b.blocker_id = pr.id and b.blocked_id = auth.uid())
  order by greatest(extensions.similarity(pr.username, lower(p_query)), extensions.similarity(pr.display_name, p_query)) desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.search_profiles(text, int) from public, anon;
grant execute on function public.search_profiles(text, int) to authenticated;

-- Quem eu bloqueei (o mais recente primeiro). Só os campos do cartão.
create function public.my_blocked_profiles()
returns table (id uuid, username text, display_name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url, b.created_at
  from public.blocks b
  join public.profiles pr on pr.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
  limit 500;
$$;
revoke execute on function public.my_blocked_profiles() from public, anon;
grant execute on function public.my_blocked_profiles() to authenticated;
