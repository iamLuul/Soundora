-- Painel admin › Usuários: filtros e ordenação.
--
-- p_filter: all | verified | regular (nem verificado, nem admin, nem suspenso) | admin |
--           suspended | reported (com denúncia aberta contra a pessoa ou o que ela publicou)
-- p_sort:   relevance (busca exata, mais denúncias, suspensas, mais novas) |
--           followers_desc | followers_asc | name_asc | name_desc (pelo @)
-- Agora também devolve quantos seguidores a pessoa tem.

drop function public.admin_users(text, int);

create function public.admin_users(
  p_query text default '',
  p_filter text default 'all',
  p_sort text default 'relevance',
  p_limit int default 50
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  suspended_until timestamptz,
  is_admin boolean,
  created_at timestamptz,
  post_count int,
  open_reports int,
  follower_count int
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  perform private.require_admin();
  if p_filter not in ('all', 'verified', 'regular', 'admin', 'suspended', 'reported')
     or p_sort not in ('relevance', 'followers_desc', 'followers_asc', 'name_asc', 'name_desc') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  return query
  with against as (
    -- Denúncias abertas contra a pessoa (perfil) ou contra o que ela publicou.
    select coalesce(p.author_id, c.author_id, v.author_id, pr.id) as uid, count(*)::int as n
    from public.reports r
    left join public.posts p on r.target_type = 'post' and p.id = r.target_id
    left join public.comments c on r.target_type = 'comment' and c.id = r.target_id
    left join public.vibes v on r.target_type = 'vibe' and v.id = r.target_id
    left join public.profiles pr on r.target_type = 'profile' and pr.id = r.target_id
    where r.status = 'open'
    group by 1
  ),
  people as (
    select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.verified, pr.suspended_until, pr.created_at,
           exists (select 1 from public.admins ad where ad.user_id = pr.id) as admin,
           coalesce(a.n, 0) as reports,
           coalesce(pr.suspended_until > now(), false) as suspended
    from public.profiles pr
    left join against a on a.uid = pr.id
    where q = ''
       or pr.username like '%' || replace(replace(q, '@', ''), '%', '') || '%'
       or lower(pr.display_name) like '%' || replace(q, '%', '') || '%'
  ),
  filtered as (
    select x.*, (select count(*)::int from public.follows f where f.followee_id = x.id) as followers
    from people x
    where case p_filter
      when 'verified' then x.verified
      when 'admin' then x.admin
      when 'suspended' then x.suspended
      when 'reported' then x.reports > 0
      when 'regular' then not x.verified and not x.admin and not x.suspended
      else true
    end
  )
  select f.id, f.username, f.display_name, f.avatar_url, f.verified, f.suspended_until, f.admin, f.created_at,
         (select count(*)::int from public.posts p where p.author_id = f.id),
         f.reports, f.followers
  from filtered f
  order by
    case when p_sort = 'relevance' and q <> '' and f.username = replace(q, '@', '') then 0 else 1 end,
    case when p_sort = 'followers_desc' then f.followers end desc nulls last,
    case when p_sort = 'followers_asc' then f.followers end asc nulls last,
    case when p_sort = 'name_asc' then f.username end asc,
    case when p_sort = 'name_desc' then f.username end desc,
    case when p_sort = 'relevance' then f.reports end desc,
    case when p_sort = 'relevance' then f.suspended end desc,
    f.created_at desc
  limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke execute on function public.admin_users(text, text, text, int) from public, anon;
grant execute on function public.admin_users(text, text, text, int) to authenticated;
