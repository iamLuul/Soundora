-- Painel admin: moderação e curadoria sem SQL.
--
-- Quem é admin continua na tabela public.admins (só o banco põe alguém lá). Todas as funções
-- abaixo conferem public.is_admin() primeiro e respondem 'forbidden' para quem não é.
-- Cada ação fica registrada em public.admin_actions (quem fez, o quê, quando).
--
-- Suspensão: profiles.suspended_until (null = conta normal; 'infinity' = sem data para voltar).
-- Conta suspensa continua entrando e vendo o app, mas não posta, comenta, curte, segue,
-- publica vibe nem denuncia (o banco recusa com 'account_suspended') e o app mostra o aviso.

-- ---------------------------------------------------------------- suspensão

alter table public.profiles add column suspended_until timestamptz;
-- (Fora do "grant update" do app, como o verified: só estas funções mudam.)

create function private.is_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select suspended_until > now() from public.profiles where id = p_user), false);
$$;
revoke execute on function private.is_suspended(uuid) from public;

-- Trigger genérico: o argumento é a coluna com o id de quem está agindo.
create function private.tg_block_suspended() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_suspended((to_jsonb(new) ->> tg_argv[0])::uuid) then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_block_suspended() from public;

create trigger block_suspended before insert on public.posts for each row execute function private.tg_block_suspended('author_id');
create trigger block_suspended before insert on public.comments for each row execute function private.tg_block_suspended('author_id');
create trigger block_suspended before insert on public.likes for each row execute function private.tg_block_suspended('user_id');
create trigger block_suspended before insert on public.comment_likes for each row execute function private.tg_block_suspended('user_id');
create trigger block_suspended before insert on public.follows for each row execute function private.tg_block_suspended('follower_id');
create trigger block_suspended before insert on public.vibes for each row execute function private.tg_block_suspended('author_id');
create trigger block_suspended before insert on public.reports for each row execute function private.tg_block_suspended('reporter_id');

-- ---------------------------------------------------------------- registro

create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('dismiss', 'remove', 'verify', 'unverify', 'suspend', 'unsuspend')),
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'vibe')),
  target_id uuid not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index admin_actions_created on public.admin_actions (created_at desc);
alter table public.admin_actions enable row level security;
create policy "admin vê o registro" on public.admin_actions for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.admin_actions from anon, authenticated;

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_admin() from public;

create function private.log_admin(p_action text, p_type text, p_target uuid, p_details jsonb default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_type, p_target, p_details);
$$;
revoke execute on function private.log_admin(text, text, uuid, jsonb) from public;

-- ---------------------------------------------------------------- resumo

create function public.admin_overview()
returns table (open_reports int, suspended int, verified int, featured_active int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query select
    (select count(distinct (r.target_type, r.target_id))::int from public.reports r where r.status = 'open'),
    (select count(*)::int from public.profiles p where p.suspended_until > now()),
    (select count(*)::int from public.profiles p where p.verified),
    (select count(*)::int from public.featured f where f.starts_at <= now() and (f.ends_at is null or f.ends_at > now()));
end;
$$;

-- ---------------------------------------------------------------- denúncias

-- Denúncias agrupadas pelo que foi denunciado (um post com 5 denúncias é uma linha), as com
-- mais denúncias e mais recentes primeiro. Traz um resumo do conteúdo e quem é o autor.
create function public.admin_reports(p_status text default 'open', p_limit int default 30, p_offset int default 0)
returns table (
  target_type text,
  target_id uuid,
  report_count int,
  reasons text[],
  details text[],
  latest_at timestamptz,
  status text,
  exists_now boolean,
  preview text,
  post_id uuid,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  author_suspended_until timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  return query
  with grouped as (
    select r.target_type, r.target_id, count(*)::int as n,
           array_agg(distinct r.reason) as reasons,
           array_remove(array_agg(r.details order by r.created_at desc), null) as details,
           max(r.created_at) as latest_at
    from public.reports r
    where r.status = p_status
    group by r.target_type, r.target_id
    order by count(*) desc, max(r.created_at) desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  ),
  resolved as (
    select g.*,
      case g.target_type
        when 'post' then (select p.author_id from public.posts p where p.id = g.target_id)
        when 'comment' then (select c.author_id from public.comments c where c.id = g.target_id)
        when 'vibe' then (select v.author_id from public.vibes v where v.id = g.target_id)
        when 'profile' then (select pr.id from public.profiles pr where pr.id = g.target_id)
      end as author,
      case g.target_type
        when 'post' then (select coalesce(nullif(p.body, ''), lp.title) from public.posts p left join public.link_previews lp on lp.id = p.link_preview_id where p.id = g.target_id)
        when 'comment' then (select c.body from public.comments c where c.id = g.target_id)
        when 'vibe' then (select coalesce(nullif(v.text, ''), v.kind) from public.vibes v where v.id = g.target_id)
        when 'profile' then (select pr.display_name || coalesce(' · ' || pr.bio, '') from public.profiles pr where pr.id = g.target_id)
      end as preview,
      case g.target_type
        when 'post' then g.target_id
        when 'comment' then (select c.post_id from public.comments c where c.id = g.target_id)
      end as post_id
    from grouped g
  )
  select x.target_type, x.target_id, x.n, x.reasons, x.details[1:5], x.latest_at, p_status,
         x.author is not null, left(x.preview, 300), x.post_id,
         x.author, a.username, a.avatar_url, a.suspended_until
  from resolved x
  left join public.profiles a on a.id = x.author
  order by x.n desc, x.latest_at desc;
end;
$$;

-- Resolve as denúncias abertas de um conteúdo: 'dismiss' (não fere as regras) ou 'remove'
-- (apaga o post, comentário ou vibe). Perfil não se apaga: suspenda a conta.
create function public.admin_resolve(p_target_type text, p_target_id uuid, p_action text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  perform private.require_admin();
  if p_action not in ('dismiss', 'remove') or p_target_type not in ('post', 'comment', 'profile', 'vibe') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_action = 'remove' then
    case p_target_type
      when 'post' then delete from public.posts where id = p_target_id;
      when 'comment' then delete from public.comments where id = p_target_id;
      when 'vibe' then delete from public.vibes where id = p_target_id;
      else raise exception 'cannot_remove_profile' using errcode = 'P0001';
    end case;
  end if;
  update public.reports
  set status = case when p_action = 'remove' then 'resolved' else 'dismissed' end, resolved_at = now()
  where target_type = p_target_type and target_id = p_target_id and status = 'open';
  get diagnostics v_count = row_count;
  perform private.log_admin(p_action, p_target_type, p_target_id, jsonb_build_object('reports', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- usuários

-- Busca por @ ou nome; sem busca, as contas com mais denúncias abertas e as suspensas primeiro.
create function public.admin_users(p_query text default '', p_limit int default 30)
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
  open_reports int
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  perform private.require_admin();
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
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.verified, pr.suspended_until,
         exists (select 1 from public.admins ad where ad.user_id = pr.id),
         pr.created_at,
         (select count(*)::int from public.posts p where p.author_id = pr.id),
         coalesce(a.n, 0)
  from public.profiles pr
  left join against a on a.uid = pr.id
  where q = '' or pr.username like '%' || replace(replace(q, '@', ''), '%', '') || '%' or lower(pr.display_name) like '%' || replace(q, '%', '') || '%'
  order by
    case when q <> '' and pr.username = replace(q, '@', '') then 0 else 1 end,
    coalesce(a.n, 0) desc,
    (pr.suspended_until > now()) desc nulls last,
    pr.created_at desc
  limit least(greatest(p_limit, 1), 100);
end;
$$;

create function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.profiles set verified = p_verified where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.log_admin(case when p_verified then 'verify' else 'unverify' end, 'profile', p_user);
end;
$$;

-- Suspende por p_days dias (null = sem data para voltar) ou reativa (p_days = 0).
-- Não vale para a própria conta nem para outros admins.
create function public.admin_suspend(p_user uuid, p_days int)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  perform private.require_admin();
  if p_user = auth.uid() or exists (select 1 from public.admins where user_id = p_user) then
    raise exception 'cannot_suspend_admin' using errcode = 'P0001';
  end if;
  if p_days is not null and (p_days < 0 or p_days > 3650) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  v_until := case when p_days = 0 then null when p_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_days) end;
  update public.profiles set suspended_until = v_until where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.log_admin(case when v_until is null then 'unsuspend' else 'suspend' end, 'profile', p_user, jsonb_build_object('days', p_days));
  return v_until;
end;
$$;

revoke execute on function
  public.admin_overview(),
  public.admin_reports(text, int, int),
  public.admin_resolve(text, uuid, text),
  public.admin_users(text, int),
  public.admin_set_verified(uuid, boolean),
  public.admin_suspend(uuid, int)
from public, anon;
grant execute on function
  public.admin_overview(),
  public.admin_reports(text, int, int),
  public.admin_resolve(text, uuid, text),
  public.admin_users(text, int),
  public.admin_set_verified(uuid, boolean),
  public.admin_suspend(uuid, int)
to authenticated;
