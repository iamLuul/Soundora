-- Comunidades (como as do Orkut): gente reunida em volta de uma banda, um artista ou um gênero.
--
-- - Qualquer pessoa cria uma comunidade (nome, @, descrição, gêneros, artistas e cor) e vira a dona.
-- - Aberta: qualquer um entra e vê os posts sem entrar. Fechada: para entrar, um moderador
--   precisa aceitar; os posts ficam escondidos de quem não é membro (no banco, não só na tela).
-- - Papéis: dona (edita, nomeia moderadores, apaga), moderadores (aceitam pedidos, removem
--   posts, banem) e membros.
-- - Post de comunidade (posts.community_id) aparece só na comunidade e na aba Comunidades do
--   Início: não entra no perfil, no Seguindo, na busca de posts, nos gêneros nem no Descobrir.
--   No Para você, só os muito populares das comunidades de que a pessoa faz parte.
-- - Recomendações: comunidades parecidas com o gosto da pessoa (gêneros, artistas, palavras e
--   o gosto médio dos membros) e, em "Contas para seguir", gente das mesmas comunidades.
--
-- Segurança: as tabelas ficam fechadas para escrita do app; tudo passa pelas funções abaixo, que
-- conferem o login, o papel de quem pede e os bloqueios. Ver posts usa private.community_visible
-- em todas as funções que leem posts (e na policy da tabela posts).

-- ---------------------------------------------------------------- tabelas

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{3,30}$'),
  name text not null check (char_length(btrim(name)) between 3 and 60),
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'open' check (visibility in ('open', 'closed')),
  color smallint not null default 0 check (color between 0 and 5),
  -- Nomes como a pessoa escreveu (até 10) e as chaves para comparar com o gosto (minúsculas, sem acento).
  artists text[] not null default '{}' check (cardinality(artists) <= 10),
  artist_keys text[] not null default '{}',
  terms text[] generated always as (private.terms(name || ' ' || description)) stored,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  member_count int not null default 0
);
create index communities_terms on public.communities using gin (terms);
create index communities_artist_keys on public.communities using gin (artist_keys);
create index communities_name_trgm on public.communities using gin (lower(name) extensions.gin_trgm_ops);

create table public.community_genres (
  community_id uuid not null references public.communities (id) on delete cascade,
  genre text not null references public.genres (slug) on delete cascade,
  primary key (community_id, genre)
);
create index community_genres_genre on public.community_genres (genre);

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  -- pending: pediu para entrar (fechada); banned: removido por um moderador (não volta sozinho).
  status text not null default 'active' check (status in ('active', 'pending', 'banned')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id),
  check (role = 'member' or status = 'active')
);
create index community_members_user on public.community_members (user_id) where status = 'active';
create index community_members_pending on public.community_members (community_id) where status = 'pending';
-- Uma dona por comunidade.
create unique index community_one_owner on public.community_members (community_id) where role = 'owner';

alter table public.posts add column community_id uuid references public.communities (id) on delete cascade;
create index posts_community on public.posts (community_id, created_at desc, id desc) where community_id is not null;

alter table public.communities enable row level security;
alter table public.community_genres enable row level security;
alter table public.community_members enable row level security;
revoke all on public.communities, public.community_genres, public.community_members from anon, authenticated;

-- Contador de membros ativos.
create function private.tg_community_member_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(new.community_id, old.community_id);
begin
  update public.communities c
  set member_count = (select count(*) from public.community_members m where m.community_id = v_id and m.status = 'active')
  where c.id = v_id;
  return null;
end;
$$;
revoke execute on function private.tg_community_member_count() from public;
create trigger member_count after insert or update or delete on public.community_members
  for each row execute function private.tg_community_member_count();

-- Conta suspensa não cria comunidade nem entra.
create trigger block_suspended before insert on public.communities
  for each row execute function private.tg_block_suspended('created_by');

-- ---------------------------------------------------------------- quem pode o quê

-- Meu papel na comunidade (null = não sou membro ativo).
create function private.community_role(p_community uuid, p_user uuid default auth.uid()) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.community_members
  where community_id = p_community and user_id = p_user and status = 'active';
$$;
revoke execute on function private.community_role(uuid, uuid) from public;

-- Posso ver os posts? (post geral, comunidade aberta, ou sou membro da fechada)
create function public.community_visible(p_community uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_community is null
    or exists (select 1 from public.communities c where c.id = p_community and c.visibility = 'open')
    or exists (
      select 1 from public.community_members m
      where m.community_id = p_community and m.user_id = auth.uid() and m.status = 'active'
    );
$$;
revoke execute on function public.community_visible(uuid) from public, anon;
grant execute on function public.community_visible(uuid) to authenticated;

-- Dados da comunidade que vão junto com o post (para o cartão "post da comunidade X").
create function private.post_community_json(p_community uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_community is null then null else (
    select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'color', c.color, 'closed', c.visibility = 'closed')
    from public.communities c where c.id = p_community
  ) end;
$$;
revoke execute on function private.post_community_json(uuid) from public;

-- Post "muito popular" na comunidade (vai para o Para você de quem é membro).
create function private.community_post_popular(p_likes int, p_members int) returns boolean
language sql immutable set search_path = '' as $$
  select p_likes >= greatest(5, ceil(coalesce(p_members, 0) * 0.1));
$$;

create function private.require_mod(p_community uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := private.community_role(p_community);
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_role is null or v_role = 'member' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;
revoke execute on function private.require_mod(uuid) from public;

-- Normaliza e confere gêneros e artistas.
create function private.community_artists(p text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(a order by ord), '{}') from (
    select distinct on (lower(btrim(x))) btrim(x) as a, ord
    from unnest(coalesce(p, '{}')) with ordinality as t(x, ord)
    where char_length(btrim(x)) between 1 and 60
    order by lower(btrim(x)), ord
  ) s;
$$;

create function private.community_set_genres(p_community uuid, p_genres text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if cardinality(coalesce(p_genres, '{}')) > 5
     or exists (select 1 from unnest(coalesce(p_genres, '{}')) g where not exists (select 1 from public.genres x where x.slug = g)) then
    raise exception 'invalid_genre' using errcode = 'P0001';
  end if;
  delete from public.community_genres where community_id = p_community;
  insert into public.community_genres (community_id, genre)
  select p_community, g from (select distinct unnest(coalesce(p_genres, '{}')) g) x;
end;
$$;
revoke execute on function private.community_set_genres(uuid, text[]) from public;

-- ---------------------------------------------------------------- criar e editar

create function public.community_create(
  p_slug text, p_name text, p_description text default '', p_visibility text default 'open',
  p_genres text[] default '{}', p_artists text[] default '{}', p_color int default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_artists text[] := private.community_artists(p_artists);
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if v_slug !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'community_slug_invalid' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 60 or char_length(coalesce(p_description, '')) > 500
     or coalesce(p_visibility, '') not in ('open', 'closed') or coalesce(p_color, -1) not between 0 and 5
     or cardinality(v_artists) > 10 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.communities where slug = v_slug) then
    raise exception 'community_slug_taken' using errcode = 'P0001';
  end if;
  if not private.hit(v_me, 'community_create', 5, interval '1 day') then
    raise exception 'rate_limited' using errcode = 'P0001', detail = coalesce(private.retry_after(v_me, 'community_create', interval '1 day'), 3600)::text;
  end if;

  insert into public.communities (slug, name, description, visibility, color, artists, artist_keys, created_by)
  values (v_slug, btrim(p_name), btrim(coalesce(p_description, '')), p_visibility, p_color, v_artists,
          (select coalesce(array_agg(distinct k), '{}') from unnest(v_artists) a, unnest(private.artist_names(a)) k),
          v_me)
  returning id into v_id;
  perform private.community_set_genres(v_id, p_genres);
  insert into public.community_members (community_id, user_id, role, status) values (v_id, v_me, 'owner', 'active');
  return v_id;
end;
$$;

-- Só a dona edita. Fechada → aberta: quem estava esperando entra.
create function public.community_update(
  p_community uuid, p_name text, p_description text, p_visibility text,
  p_genres text[], p_artists text[], p_color int
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_artists text[] := private.community_artists(p_artists);
begin
  if private.community_role(p_community) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 60 or char_length(coalesce(p_description, '')) > 500
     or coalesce(p_visibility, '') not in ('open', 'closed') or coalesce(p_color, -1) not between 0 and 5
     or cardinality(v_artists) > 10 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.communities set
    name = btrim(p_name), description = btrim(coalesce(p_description, '')), visibility = p_visibility, color = p_color,
    artists = v_artists,
    artist_keys = (select coalesce(array_agg(distinct k), '{}') from unnest(v_artists) a, unnest(private.artist_names(a)) k)
  where id = p_community;
  perform private.community_set_genres(p_community, p_genres);
  if p_visibility = 'open' then
    update public.community_members set status = 'active' where community_id = p_community and status = 'pending';
  end if;
end;
$$;

-- Apagar a comunidade (só a dona): os posts dela somem junto.
create function public.community_delete(p_community uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.community_role(p_community) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  delete from public.communities where id = p_community;
end;
$$;

-- ---------------------------------------------------------------- entrar e sair

-- Entrar: aberta = na hora; fechada = pedido para os moderadores. Banido não entra.
create function public.community_join(p_community uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_visibility text;
  v_status text;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if private.is_suspended(v_me) then
    raise exception 'account_suspended' using errcode = 'P0001';
  end if;
  select visibility into v_visibility from public.communities where id = p_community;
  if v_visibility is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select status into v_status from public.community_members where community_id = p_community and user_id = v_me;
  if v_status = 'banned' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_status is not null then
    return v_status;
  end if;
  if not private.hit(v_me, 'community_join', 60, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0001', detail = coalesce(private.retry_after(v_me, 'community_join', interval '1 hour'), 60)::text;
  end if;
  v_status := case when v_visibility = 'open' then 'active' else 'pending' end;
  insert into public.community_members (community_id, user_id, status) values (p_community, v_me, v_status);
  return v_status;
end;
$$;

-- Sair (ou desistir do pedido). A dona não sai: passa a comunidade para alguém ou apaga.
create function public.community_leave(p_community uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if private.community_role(p_community) = 'owner' then
    raise exception 'community_owner_cannot_leave' using errcode = 'P0001';
  end if;
  delete from public.community_members
  where community_id = p_community and user_id = auth.uid() and status <> 'banned';
end;
$$;

-- ---------------------------------------------------------------- moderação

-- Aceitar ou recusar um pedido (moderadores).
create function public.community_respond(p_community uuid, p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_mod(p_community);
  if p_accept then
    update public.community_members set status = 'active', created_at = now()
    where community_id = p_community and user_id = p_user and status = 'pending';
  else
    delete from public.community_members where community_id = p_community and user_id = p_user and status = 'pending';
  end if;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Banir (tira e impede de voltar) ou desbanir. Moderador não bane moderador nem a dona.
create function public.community_ban(p_community uuid, p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_my_role text := private.require_mod(p_community);
  v_their_role text;
begin
  if p_user = auth.uid() then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select role into v_their_role from public.community_members where community_id = p_community and user_id = p_user;
  if v_their_role = 'owner' or (v_their_role = 'moderator' and v_my_role <> 'owner') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_banned then
    insert into public.community_members (community_id, user_id, role, status) values (p_community, p_user, 'member', 'banned')
    on conflict (community_id, user_id) do update set role = 'member', status = 'banned';
  else
    delete from public.community_members where community_id = p_community and user_id = p_user and status = 'banned';
  end if;
end;
$$;

-- Papel de um membro (só a dona): moderador, membro, ou passar a comunidade (a dona vira moderadora).
create function public.community_set_role(p_community uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.community_role(p_community) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() or p_role not in ('owner', 'moderator', 'member') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if private.community_role(p_community, p_user) is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_role = 'owner' then
    update public.community_members set role = 'moderator' where community_id = p_community and user_id = auth.uid();
  end if;
  update public.community_members set role = p_role where community_id = p_community and user_id = p_user;
end;
$$;

-- Remover um post da comunidade (moderadores; o autor também pode, pelo apagar de sempre).
create function public.community_remove_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_community uuid;
begin
  select community_id into v_community from public.posts where id = p_post;
  if v_community is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.require_mod(v_community);
  delete from public.posts where id = p_post;
end;
$$;

-- ---------------------------------------------------------------- leitura

create function public.community_get(p_slug text)
returns table (
  id uuid, slug text, name text, description text, visibility text, color int, artists text[], genres text[],
  member_count int, created_at timestamptz, my_role text, my_status text, can_view boolean, pending_count int
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.description, c.visibility, c.color, c.artists,
    coalesce((select array_agg(g.genre order by g.genre) from public.community_genres g where g.community_id = c.id), '{}'),
    c.member_count, c.created_at, m.role, m.status,
    public.community_visible(c.id),
    case when m.status = 'active' and m.role in ('owner', 'moderator')
      then (select count(*)::int from public.community_members x where x.community_id = c.id and x.status = 'pending') end
  from public.communities c
  left join public.community_members m on m.community_id = c.id and m.user_id = auth.uid()
  where c.slug = lower(btrim(p_slug)) and auth.uid() is not null;
$$;

-- Comunidades de que faço parte (para o filtro da aba Comunidades e para postar).
create function public.my_communities()
returns table (id uuid, slug text, name text, color int, visibility text, role text, member_count int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.color, c.visibility, m.role, c.member_count
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by lower(c.name)
  limit 200;
$$;

-- Membros (ativos: quem pode ver a comunidade; pedidos e banidos: só moderadores).
create function public.community_members_list(p_community uuid, p_status text default 'active', p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text, status text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url, m.role, m.status, m.created_at
  from public.community_members m
  join public.profiles pr on pr.id = m.user_id
  where m.community_id = p_community
    and m.status = coalesce(p_status, 'active')
    and not public.is_blocked_with(pr.id)
    and case
      when coalesce(p_status, 'active') = 'active' then public.community_visible(p_community)
      else private.community_role(p_community) in ('owner', 'moderator')
    end
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, m.created_at desc, pr.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- Buscar comunidades pelo nome, @, artistas ou palavras da descrição.
create function public.communities_search(p_query text, p_limit int default 20)
returns table (id uuid, slug text, name text, description text, visibility text, color int, member_count int, joined boolean)
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(btrim(coalesce(p_query, ''))) as s,
      private.terms(p_query) as terms,
      (select coalesce(array_agg(k), '{}') from unnest(private.artist_names(p_query)) k) as artists
  )
  select c.id, c.slug, c.name, left(c.description, 200), c.visibility, c.color, c.member_count,
    exists (select 1 from public.community_members m where m.community_id = c.id and m.user_id = auth.uid() and m.status = 'active')
  from public.communities c, q
  where auth.uid() is not null
    and char_length(q.s) >= 2
    and (lower(c.name) like '%' || replace(replace(q.s, '%', ''), '_', '\_') || '%'
         or c.slug like '%' || replace(replace(ltrim(q.s, '@'), '%', ''), '_', '\_') || '%'
         or c.terms && q.terms
         or c.artist_keys && q.artists)
  order by (lower(c.name) = q.s) desc, (lower(c.name) like q.s || '%') desc, c.member_count desc, c.name
  limit least(greatest(p_limit, 1), 50);
$$;

-- Comunidades para mim: gêneros, artistas e palavras do meu gosto, e o gosto médio dos membros.
create function public.communities_recommended(p_limit int default 8)
returns table (id uuid, slug text, name text, description text, visibility text, color int, member_count int, genres text[], reason text)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid, now() as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  terms as (select t.term, t.kind, t.weight from me, private.taste_terms(me.uid, me.at) t),
  mine as (select community_id from public.community_members, me where user_id = me.uid),
  pool as (
    select c.* from public.communities c
    where c.id not in (select community_id from mine)
      and (c.created_by is null or not public.is_blocked_with(c.created_by))
    order by c.member_count desc, c.created_at desc
    limit 2000
  ),
  genre_fit as (
    select g.community_id as id, sum(t.weight) as w, (array_agg(g.genre order by t.weight desc))[1:2] as top
    from public.community_genres g join taste t on t.genre = g.genre
    where g.community_id in (select id from pool)
    group by g.community_id
  ),
  artist_fit as (
    select p.id, sum(t.weight) as w
    from pool p, unnest(p.artist_keys) a join terms t on t.kind = 'artist' and t.term = a
    group by p.id
  ),
  word_fit as (
    select p.id, sum(t.weight) as w
    from pool p, unnest(p.terms) w join terms t on t.kind = 'word' and t.term = w
    group by p.id
  ),
  -- Perfil médio dos membros: quanto os gêneros deles batem com o meu gosto (amostra de até 200).
  member_fit as (
    select p.id, avg(coalesce(x.w, 0)) as w
    from pool p
    cross join lateral (
      select m.user_id from public.community_members m
      where m.community_id = p.id and m.status = 'active'
      order by m.created_at desc limit 200
    ) mm
    left join lateral (
      select sum(t.weight) as w from public.user_genres ug join taste t on t.genre = ug.genre where ug.user_id = mm.user_id
    ) x on true
    group by p.id
  ),
  scored as (
    select p.id,
      coalesce(g.w, 0) + 1.5 * least(coalesce(a.w, 0), 3) + 0.6 * least(coalesce(w.w, 0), 2) + 0.8 * least(coalesce(mf.w, 0), 2)
        + 0.2 * ln(1 + p.member_count) as score,
      case
        when coalesce(a.w, 0) > 0 then 'artists'
        when coalesce(g.w, 0) > 0 then 'genres'
        when coalesce(mf.w, 0) > 0 then 'members'
        else 'popular'
      end as reason
    from pool p
    left join genre_fit g on g.id = p.id
    left join artist_fit a on a.id = p.id
    left join word_fit w on w.id = p.id
    left join member_fit mf on mf.id = p.id
  )
  select c.id, c.slug, c.name, left(c.description, 200), c.visibility, c.color, c.member_count,
    coalesce((select array_agg(g.genre order by g.genre) from public.community_genres g where g.community_id = c.id), '{}'),
    s.reason
  from scored s join public.communities c on c.id = s.id, me
  where me.uid is not null
  order by s.score desc, c.member_count desc, c.created_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

-- ---------------------------------------------------------------- posts de comunidade

-- O post leva junto a comunidade (cartão "post da comunidade X").
alter type public.feed_item add attribute community jsonb;

-- Policy da tabela: post de comunidade fechada só para os membros (curtidas e comentários usam
-- esta policy para conferir o post, então também ficam fechados).
drop policy "posts visíveis" on public.posts;
create policy "posts visíveis" on public.posts for select to authenticated
  using (not public.content_hidden(author_id) and public.community_visible(community_id));

-- Postar: geral (perfil e timeline) ou numa comunidade de que sou membro.
drop function public.post_create(text, uuid, text[], jsonb);
CREATE FUNCTION public.post_create(p_body text DEFAULT ''::text, p_link_preview_id uuid DEFAULT NULL::uuid, p_genres text[] DEFAULT '{}'::text[], p_media jsonb DEFAULT '[]'::jsonb, p_community uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_count int := coalesce(jsonb_array_length(p_media), 0);
  v_videos int;
  v_id uuid;
  v_item jsonb;
  v_pos int := 0;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'post_text_too_long';
  end if;
  if jsonb_typeof(coalesce(p_media, '[]')) <> 'array' or v_count > 4 then
    raise exception 'invalid_media';
  end if;
  select count(*) into v_videos from jsonb_array_elements(coalesce(p_media, '[]')) e where e ->> 'kind' = 'video';
  if v_videos > 1 or (v_videos = 1 and v_count > 1) then
    raise exception 'invalid_media'; -- até 4 fotos OU 1 vídeo
  end if;
  if p_link_preview_id is null and v_count = 0 and v_body = '' then
    raise exception 'post_empty';
  end if;
  if p_link_preview_id is null and cardinality(coalesce(p_genres, '{}')) > 0 then
    raise exception 'genres_need_music';
  end if;
  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;
  -- Post de comunidade: só membro ativo (banido ou com pedido pendente não posta).
  if p_community is not null and private.community_role(p_community, v_me) is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]')) loop
    if split_part(v_item ->> 'path', '/', 1) <> v_me::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'post-media' and o.name = v_item ->> 'path')
       or exists (select 1 from public.post_media m where m.path = v_item ->> 'path') then
      raise exception 'invalid_media';
    end if;
  end loop;

  insert into public.posts (author_id, body, link_preview_id, genres, type, community_id)
  values (
    v_me, v_body, p_link_preview_id, coalesce(p_genres, '{}'),
    case when p_link_preview_id is not null then 'music' when v_count > 0 then 'media' else 'text' end,
    p_community
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]')) loop
    insert into public.post_media (post_id, position, kind, path, width, height, duration_ms)
    values (
      v_id, v_pos, v_item ->> 'kind', v_item ->> 'path',
      least(greatest((v_item ->> 'width')::int, 1), 4096),
      least(greatest((v_item ->> 'height')::int, 1), 4096),
      case when v_item ->> 'kind' = 'video' then (v_item ->> 'duration_ms')::int end
    );
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end;
$function$;
revoke execute on function public.post_create(text, uuid, text[], jsonb, uuid) from public, anon;
grant execute on function public.post_create(text, uuid, text[], jsonb, uuid) to authenticated;

-- Aba Comunidades do Início e página da comunidade: p_community null = todas as minhas.
create function public.community_posts(p_community uuid default null, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    null::float8,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where auth.uid() is not null
    and p.community_id is not null
    and case
      when p_community is null then p.community_id in (
        select m.community_id from public.community_members m where m.user_id = auth.uid() and m.status = 'active'
      )
      else p.community_id = p_community and public.community_visible(p_community)
    end
    and not public.content_hidden(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------- contas para seguir

CREATE OR REPLACE FUNCTION public.suggested_accounts(p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, username text, display_name text, avatar_url text, genres text[], reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid, now() as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  excluded as (
    select (select uid from me) as id
    union select followee_id from public.follows, me where follower_id = me.uid
    union select b.blocked_id from public.blocks b, me where b.blocker_id = me.uid
    union select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
  ),
  -- Gêneros do perfil e dos posts recentes de cada pessoa que batem com o meu gosto.
  genre_fit as (
    select x.id, sum(t.weight) as w,
      (array_agg(t.genre order by t.weight desc) filter (where t.weight >= 0.25))[1:2] as top
    from (
      select ug.user_id as id, ug.genre from public.user_genres ug
      union
      select p.author_id, g from public.posts p, me, unnest(p.genres) g
      where p.created_at > me.at - interval '60 days'
    ) x
    join taste t on t.genre = x.genre
    where x.id not in (select id from excluded)
    group by x.id
  ),
  liked_authors as (
    select p.author_id as id, count(*)::float8 as n
    from public.likes l join public.posts p on p.id = l.post_id, me
    where l.user_id = me.uid and l.created_at > me.at - interval '90 days'
      and p.author_id not in (select id from excluded)
    group by p.author_id
  ),
  -- Seguido por quem eu sigo.
  friends_of_friends as (
    select f2.followee_id as id, count(*)::float8 as n
    from public.follows f1 join public.follows f2 on f2.follower_id = f1.followee_id, me
    where f1.follower_id = me.uid and f2.followee_id not in (select id from excluded)
    group by f2.followee_id
  ),
  -- Gente das mesmas comunidades (quanto mais comunidades em comum, melhor).
  community_mates as (
    select m2.user_id as id, count(*)::float8 as n
    from public.community_members m1
    join public.community_members m2 on m2.community_id = m1.community_id and m2.status = 'active', me
    where m1.user_id = me.uid and m1.status = 'active' and m2.user_id not in (select id from excluded)
    group by m2.user_id
    order by count(*) desc
    limit 500
  ),
  pool as (
    select id from genre_fit union select id from liked_authors union select id from friends_of_friends
    union select id from community_mates
  ),
  scored as (
    select pool.id,
      coalesce(g.w, 0) + 0.8 * ln(1 + coalesce(l.n, 0)) + 0.6 * ln(1 + coalesce(f.n, 0)) + 0.9 * ln(1 + coalesce(cm.n, 0))
        + case when exists (select 1 from public.posts p, me where p.author_id = pool.id and p.created_at > me.at - interval '14 days') then 0.3 else 0 end
        as score,
      coalesce(g.top, '{}') as top,
      case
        when coalesce(l.n, 0) >= 2 then 'liked'
        when cardinality(coalesce(g.top, '{}')) > 0 then 'genres'
        when coalesce(cm.n, 0) > 0 then 'community'
        else 'friends'
      end as reason
    from pool
    left join genre_fit g on g.id = pool.id
    left join liked_authors l on l.id = pool.id
    left join friends_of_friends f on f.id = pool.id
    left join community_mates cm on cm.id = pool.id
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, s.top, s.reason
  from scored s
  join public.profiles pr on pr.id = s.id
  order by s.score desc, pr.created_at desc
  limit least(greatest(p_limit, 1), 30);
$function$;

-- ---------------------------------------------------------------- funções que leem posts
-- (cópias das versões atuais, com a regra das comunidades)

-- post_detail
CREATE OR REPLACE FUNCTION public.post_detail(p_post uuid)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.id = p_post
    and not public.content_hidden(p.author_id)
    and public.community_visible(p.community_id);
$function$;

-- profile_posts
CREATE OR REPLACE FUNCTION public.profile_posts(p_author uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.author_id = p_author
    and p.community_id is null -- post de comunidade fica na comunidade, não no perfil
    and not public.content_hidden(p.author_id)
    and (
      p_before is null
      or p.created_at < p_before
      or (p_before_id is not null and p.created_at = p_before and p.id < p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

-- feed_following
CREATE OR REPLACE FUNCTION public.feed_following(p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid),
  lim as (select least(greatest(p_limit, 1), 50) as n),
  authors as (
    select uid as id from me
    union
    select f.followee_id from public.follows f, me
    where f.follower_id = me.uid and not public.is_blocked_with(f.followee_id)
  ),
  -- Os mais novos de cada pessoa (pelo índice de autor + data) e, deles, os mais novos de todos.
  page as (
    select x.id, x.created_at
    from authors a
    cross join lateral (
      select p.id, p.created_at from public.posts p
      where p.author_id = a.id
        and p.community_id is null
        and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by p.created_at desc, p.id desc
      limit (select n from lim)
    ) x
    order by x.created_at desc, x.id desc
    limit (select n from lim)
  )
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l, me where l.post_id = p.id and l.user_id = me.uid) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    null::float8,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from page
  join public.posts p on p.id = page.id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  order by p.created_at desc, p.id desc;
$function$;

-- genre_posts
CREATE OR REPLACE FUNCTION public.genre_posts(p_genre text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_genre is null or not exists (select 1 from public.genres g where g.slug = p_genre) then
    raise exception 'invalid_genre' using errcode = 'P0001';
  end if;
  return query
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    null::float8,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.genres @> array[p_genre]
    and p.community_id is null
    and not public.content_hidden(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;

-- search_posts
CREATE OR REPLACE FUNCTION public.search_posts(p_query text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q text := private.fold(btrim(coalesce(p_query, '')));
  pattern text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Com menos de 3 letras o índice não serve e a busca leria todos os posts.
  if char_length(q) < 3 or char_length(q) > 100 then
    return;
  end if;
  -- % e _ digitados valem como letra, não como curinga.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    null::float8,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where private.fold(p.body) like pattern escape '\'
    and p.community_id is null
    and not public.content_hidden(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;

-- liked_posts
CREATE OR REPLACE FUNCTION public.liked_posts(p_user uuid, p_after_post uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes ml where ml.post_id = p.id and ml.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from public.likes l
  join public.posts p on p.id = l.post_id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where l.user_id = p_user
    and not public.content_hidden(p_user)
    and not public.content_hidden(p.author_id)
    and public.community_visible(p.community_id)
    and (
      p_after_post is null
      or (l.created_at, l.post_id) < (
        select c.created_at, c.post_id from public.likes c where c.user_id = p_user and c.post_id = p_after_post
      )
    )
  order by l.created_at desc, l.post_id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

-- feed_for_you
CREATE OR REPLACE FUNCTION public.feed_for_you(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone, p_seen uuid[] DEFAULT '{}'::uuid[])
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  -- Posts que a pessoa já viu (o app manda; no máximo 500).
  seen as (select coalesce((coalesce(p_seen, '{}'::uuid[]))[1:500], '{}'::uuid[]) as ids),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  terms as (select t.term, t.kind, t.weight from me, private.taste_terms(me.uid, me.at) t),
  artist_list as (select coalesce(array_agg(term), '{}') as a from terms where kind = 'artist'),
  word_list as (select coalesce(array_agg(term), '{}') as a from terms where kind = 'word'),
  -- Gêneros parecidos: o peso do pedaço é metade do maior peso entre os gêneros que o contêm.
  tokens as (
    select tok, max(t.weight) * 0.5 as weight
    from taste t, unnest(private.genre_tokens(array[t.genre])) tok
    group by tok
  ),
  has_taste as (select exists (select 1 from taste) or exists (select 1 from terms) as yes),
  following as (select followee_id as id from public.follows, me where follower_id = me.uid),
  blocked as (
    select b.blocked_id as id from public.blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
  ),
  -- Contas privadas que eu não sigo (o conteúdo delas não entra).
  hidden_private as (
    select pr.id from public.profiles pr, me
    where pr.is_private and pr.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.followee_id = pr.id)
  ),
  -- Comunidades de que faço parte: os posts muito populares delas entram no Para você.
  my_comms as (
    select c.id, c.member_count from public.community_members m join public.communities c on c.id = m.community_id, me
    where m.user_id = me.uid and m.status = 'active'
  ),
  muted as (select coalesce(array_agg(genre), '{}') as g from public.muted_genres, me where user_id = me.uid),
  -- De quem eu curto/comento posts (últimos 60 dias até abrir o feed).
  interactions as (
    select author_id as id, count(*)::float8 as n from (
      select p.author_id from public.likes l join public.posts p on p.id = l.post_id, me
      where l.user_id = me.uid and l.created_at <= me.at and l.created_at > me.at - interval '60 days'
      union all
      select p.author_id from public.comments c join public.posts p on p.id = c.post_id, me
      where c.author_id = me.uid and c.created_at <= me.at and c.created_at > me.at - interval '60 days'
    ) x, me where author_id <> me.uid group by author_id
  ),
  -- Quanto o perfil de cada autor (gêneros que ele escolheu) bate com o meu gosto.
  author_taste as (
    select ug.user_id as id, sum(t.weight) as w
    from public.user_genres ug join taste t on t.genre = ug.genre
    group by ug.user_id
  ),
  -- Posts que podem entrar (com muito post na rede, não dá para pontuar todos a cada página):
  -- os mais novos, os do meu gosto (gênero, artista, palavra) e os de quem sigo, de quem
  -- interajo e os meus. Todos dos últimos 14 dias; nunca mais que ~4.100 para pontuar.
  pool as (
    (select p.id from public.posts p, me
     where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
     order by p.created_at desc limit 1000)
    union
    (select p.id from public.posts p, me
     where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
       and p.genres && (select coalesce(array_agg(genre), '{}') from taste)
     order by p.created_at desc limit 1000)
    union
    -- Palavras: entre os 5.000 mais novos (custo fixo; o índice por palavra pegaria posts
    -- demais quando a palavra é comum).
    (select x.id from (
       select p.id, p.terms, p.created_at from public.posts p, me
       where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
       order by p.created_at desc limit 5000
     ) x
     where x.terms && (select a from word_list)
     order by x.created_at desc limit 300)
    union
    (select p.id
     from public.link_previews lp
     join public.posts p on p.link_preview_id = lp.id, me
     where lp.artist_keys && (select a from artist_list)
       and p.created_at > me.at - interval '14 days' and p.created_at <= me.at
     order by p.created_at desc limit 300)
    union
    (select p.id from public.posts p join my_comms mc on mc.id = p.community_id, me
     where p.created_at > me.at - interval '14 days' and p.created_at <= me.at
       and private.community_post_popular(p.like_count, mc.member_count)
     order by p.like_count desc limit 200)
    union
    (select y.id from (
       select x.id, x.created_at
       from (select id from following union select id from interactions union select uid from me) a
       cross join lateral (
         select p.id, p.created_at from public.posts p, me
         where p.author_id = a.id and p.created_at > me.at - interval '14 days' and p.created_at <= me.at
         order by p.created_at desc limit 30
       ) x
       order by x.created_at desc limit 1500
     ) y)
  ),
  candidates as (
    select p.id, p.author_id, p.created_at, p.like_count, p.comment_count, p.terms,
      p.genres || coalesce(lp.genres, '{}') as g,
      lp.artist_keys as artists
    from pool
    join public.posts p on p.id = pool.id
    left join public.link_previews lp on lp.id = p.link_preview_id
    where p.author_id not in (select id from blocked)
      and p.author_id not in (select id from hidden_private)
      -- Post de comunidade: só os muito populares das minhas comunidades.
      and (p.community_id is null or exists (
        select 1 from my_comms mc where mc.id = p.community_id and private.community_post_popular(p.like_count, mc.member_count)
      ))
      and not ((p.genres || coalesce(lp.genres, '{}')) && (select g from muted))
  ),
  -- Gêneros e pedaços de gênero de cada post (para cruzar com o gosto por join, não post a post).
  post_genres as (select distinct c.id, x.genre from candidates c, unnest(c.g) x (genre)),
  post_match as (
    select pg.id, sum(t.weight) as w from post_genres pg join taste t on t.genre = pg.genre group by pg.id
  ),
  near_match as (
    select x.id, sum(k.weight) as w
    from (select distinct pg.id, tok from post_genres pg, unnest(string_to_array(pg.genre, '_')) tok) x
    join tokens k on k.tok = x.tok
    group by x.id
  ),
  artist_match as (
    select c.id, sum(t.weight) as w
    from candidates c, unnest(c.artists) a join terms t on t.kind = 'artist' and t.term = a
    group by c.id
  ),
  word_match as (
    select c.id, sum(t.weight) as w
    from candidates c, unnest(c.terms) w join terms t on t.kind = 'word' and t.term = w
    group by c.id
  ),
  -- Curtidas dos posts candidatos, numa passada só: quantas de quem eu sigo (até eu abrir o
  -- feed) e quantas vieram depois da abertura (não contam, senão curtir algo enquanto rola
  -- mudaria a ordem das próximas páginas da mesma abertura). Comentários depois da abertura, idem.
  like_stats as (
    select l.post_id as id,
      count(*) filter (where l.created_at <= me.at and f.id is not null)::float8 as social,
      count(*) filter (where l.created_at > me.at) as late
    from candidates c
    join public.likes l on l.post_id = c.id
    left join following f on f.id = l.user_id
    cross join me
    group by l.post_id
  ),
  late_comments as (
    select cm.post_id as id, count(*) as n
    from candidates c
    join public.comments cm on cm.post_id = c.id
    cross join me
    where cm.created_at > me.at
    group by cm.post_id
  ),
  scored as (
    select c.id, c.created_at,
      greatest(c.like_count - coalesce(ls.late, 0), 0) as like_count,
      greatest(c.comment_count - coalesce(lc.n, 0), 0) as comment_count,
      f.id is not null as followed,
      c.author_id = (select uid from me) as mine,
      coalesce(i.n, 0) as inter,
      least(coalesce(pm.w, 0), 2) as post_match,
      least(coalesce(nm.w, 0), 1) as near_match,
      least(coalesce(a.w, 0), 2) as author_match,
      least(coalesce(am.w, 0), 1) as artist_match,
      least(coalesce(wm.w, 0), 1) as word_match,
      coalesce(ls.social, 0) as social
    from candidates c
    left join following f on f.id = c.author_id
    left join interactions i on i.id = c.author_id
    left join author_taste a on a.id = c.author_id
    left join post_match pm on pm.id = c.id
    left join near_match nm on nm.id = c.id
    left join artist_match am on am.id = c.id
    left join word_match wm on wm.id = c.id
    left join like_stats ls on ls.id = c.id
    left join late_comments lc on lc.id = c.id
  ),
  -- 1) Só a pontuação, para escolher a página (barato).
  ranked as (
    select s.id,
      s.id = any (sn.ids) as seen,
      case
        when not (select yes from has_taste) then 0
        when s.followed or s.mine or s.inter > 0 or s.post_match > 0 or s.near_match > 0 or s.author_match > 0
          or s.artist_match > 0 or s.word_match > 0 or s.social > 0 then 0
        else 1
      end as tier,
      (
        0.5
        + s.post_match + 0.6 * s.near_match + 0.5 * s.author_match
        + 1.2 * s.artist_match + 0.6 * s.word_match + 0.5 * ln(1 + s.social)
        + case when s.followed then 2.5 else 0 end
        + case when s.mine then 2 else 0 end
        + 0.8 * ln(1 + s.inter)
        + 0.5 * ln(1 + s.like_count) + 0.3 * ln(1 + s.comment_count)
      ) / power(extract(epoch from ((select at from me) - s.created_at))::float8 / 3600.0 + 2, 1.25)
      -- Variação de até ~±15% por abertura do feed (a mesma em todas as páginas dela): posts de
      -- pontuação parecida trocam de lugar a cada vez que o feed é aberto.
      * exp(0.15 * ((hashtext(s.id::text || (select at from me)::text) % 1000) / 1000.0)) as score
    from scored s, seen sn
    order by seen, tier, score desc, s.created_at desc, s.id
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  )
  -- 2) Detalhes (autor, música, mídia, curtida) só dos posts da página.
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l, me where l.post_id = p.id and l.user_id = me.uid) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    r.score,
    p.genres, private.post_media_json(p.id), p.type, private.post_community_json(p.community_id)
  from ranked r
  join public.posts p on p.id = r.id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  order by r.seen, r.tier, r.score desc, p.created_at desc, p.id;
$function$;

-- post_comments
CREATE OR REPLACE FUNCTION public.post_comments(p_post uuid)
 RETURNS TABLE(id uuid, parent_id uuid, body text, created_at timestamp with time zone, like_count integer, reply_count integer, liked_by_me boolean, author_id uuid, author_username text, author_display_name text, author_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.id, c.parent_id, c.body, c.created_at, c.like_count, c.reply_count,
    exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url
  from public.comments c
  join public.profiles a on a.id = c.author_id
  join public.posts p on p.id = c.post_id
  left join public.comments root on root.id = c.parent_id
  where c.post_id = p_post
    and not public.content_hidden(p.author_id)
    and public.community_visible(p.community_id)
    and not public.is_blocked_with(c.author_id)
    -- Resposta de um comentário escondido (bloqueio) some junto.
    and (root.id is null or not public.is_blocked_with(root.author_id))
  order by coalesce(root.created_at, c.created_at), coalesce(root.id, c.id), c.parent_id nulls first, c.created_at, c.id
  limit 500;
$function$;

-- post_media_visible
CREATE OR REPLACE FUNCTION public.post_media_visible(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.post_media m join public.posts p on p.id = m.post_id
    where m.path = p_name and not public.content_hidden(p.author_id) and public.community_visible(p.community_id)
  );
$function$;

-- profile_summary
CREATE OR REPLACE FUNCTION public.profile_summary(p_username text)
 RETURNS TABLE(id uuid, username text, display_name text, bio text, avatar_url text, banner_url text, followers integer, following integer, posts integer, likes integer, is_me boolean, i_follow boolean, is_private boolean, requested boolean, locked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    pr.id, pr.username, pr.display_name, pr.bio, pr.avatar_url, pr.banner_url,
    (select count(*)::int from public.follows f where f.followee_id = pr.id),
    (select count(*)::int from public.follows f where f.follower_id = pr.id),
    (select count(*)::int from public.posts p where p.author_id = pr.id and p.community_id is null),
    (select count(*)::int from public.discover_swipes s where s.user_id = pr.id and s.liked),
    pr.id = auth.uid(),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id),
    pr.is_private,
    exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = pr.id),
    public.content_hidden(pr.id)
  from public.profiles pr
  where pr.username = lower(p_username)
    and not public.is_blocked_with(pr.id);
$function$;

-- discover_swipe
CREATE OR REPLACE FUNCTION public.discover_swipe(p_link_preview_id uuid, p_liked boolean, p_post_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.discover_swipes (user_id, link_preview_id, liked)
  values (auth.uid(), p_link_preview_id, p_liked)
  on conflict (user_id, link_preview_id) do update set liked = excluded.liked, created_at = now();

  if p_liked and p_post_id is not null then
    insert into public.likes (user_id, post_id)
    select auth.uid(), p.id from public.posts p
    where p.id = p_post_id and p.link_preview_id = p_link_preview_id and not public.content_hidden(p.author_id) and public.community_visible(p.community_id)
    on conflict do nothing;
  end if;
end $function$;

-- trending_tracks
CREATE OR REPLACE FUNCTION public.trending_tracks(p_days integer DEFAULT 7, p_genre text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, link_preview_id uuid, url text, platform text, kind text, title text, artist text, image_url text, post_count integer, like_count integer, score integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recent as (
    select p.*
    from public.posts p
    where p.created_at > now() - make_interval(days => least(greatest(p_days, 1), 30))
      and (p_genre is null or p.genre = p_genre)
      and not public.content_hidden(p.author_id)
      and p.community_id is null
  ),
  agg as (
    select link_preview_id,
           count(distinct author_id)::int as post_count,
           coalesce(sum(like_count), 0)::int as like_count
    from recent
    group by link_preview_id
  )
  select
    (row_number() over (order by a.post_count * 3 + a.like_count desc, a.post_count desc, lp.title))::int,
    lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    a.post_count, a.like_count, a.post_count * 3 + a.like_count
  from agg a
  join public.link_previews lp on lp.id = a.link_preview_id
  order by 1
  limit least(greatest(p_limit, 1), 100);
$function$;

-- discover_cards
CREATE OR REPLACE FUNCTION public.discover_cards(p_limit integer DEFAULT 20)
 RETURNS SETOF discover_card
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select auth.uid() as uid,
           coalesce((select locale from public.profiles where id = auth.uid()), 'pt-BR') as locale
  ),
  my_genres as (select genre from public.user_genres, me where user_id = me.uid),
  seen as (select link_preview_id from public.discover_swipes, me where user_id = me.uid),
  muted as (select genre from public.muted_genres, me where user_id = me.uid),
  following as (select followee_id as id from public.follows, me where follower_id = me.uid),
  -- Autores que não entram: bloqueio nos dois sentidos e conta privada que eu não sigo.
  hidden as (
    select b.blocked_id as id from public.blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
    union
    select pr.id from public.profiles pr, me
    where pr.is_private and pr.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.followee_id = pr.id)
  ),
  feat as (
    select distinct on (f.link_preview_id)
      f.link_preview_id, f.genre,
      case when (select locale from me) = 'en' then coalesce(f.note_en, f.note_pt) else coalesce(f.note_pt, f.note_en) end as note,
      0 as bucket,
      (case when f.genre in (select genre from my_genres) then 0 else 1 end) * 100000 + f.position as rank
    from public.featured f
    where f.starts_at <= now() and (f.ends_at is null or f.ends_at > now())
      and f.link_preview_id not in (select link_preview_id from seen)
      and (f.genre is null or f.genre not in (select genre from muted))
    order by f.link_preview_id, f.position
  ),
  recent as (
    select p.link_preview_id, p.genre, p.id, p.author_id, p.like_count, p.created_at
    from public.posts p, me
    where p.created_at > now() - interval '30 days'
      and p.author_id <> me.uid
      and p.author_id not in (select id from following)
      and p.author_id not in (select id from hidden)
      and p.community_id is null
      and p.link_preview_id not in (select link_preview_id from seen)
      and p.link_preview_id not in (select link_preview_id from feat)
      and not (p.genres && (select coalesce(array_agg(genre), '{}') from muted))
      and (p.genre is null or p.genre not in (select genre from muted))
      and (p.genre in (select genre from my_genres) or not exists (select 1 from my_genres))
    order by p.created_at desc
    limit 4000
  ),
  community as (
    select distinct on (r.link_preview_id)
      r.link_preview_id, r.genre, r.id as post_id, r.author_id, r.like_count, r.created_at
    from recent r
    order by r.link_preview_id, r.like_count desc, r.created_at desc
  ),
  merged as (
    select link_preview_id, genre, note, null::uuid as post_id, null::uuid as author_id, 0 as bucket, rank::double precision as rank
    from feat
    union all
    select link_preview_id, genre, null, post_id, author_id, 1,
           -(ln(1 + like_count) + extract(epoch from created_at) / 864000.0)
    from community
  )
  select
    m.link_preview_id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url, m.genre,
    case when m.bucket = 0 then 'featured' else 'community' end,
    m.note, m.post_id, a.username, a.display_name, a.avatar_url
  from merged m
  join public.link_previews lp on lp.id = m.link_preview_id
  left join public.profiles a on a.id = m.author_id
  order by m.bucket, m.rank, m.link_preview_id
  limit least(greatest(p_limit, 1), 50);
$function$;

-- notifications_list
CREATE OR REPLACE FUNCTION public.notifications_list(p_filter text DEFAULT 'all'::text, p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 30)
 RETURNS TABLE(id bigint, kind text, created_at timestamp with time zone, read boolean, actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text, post_id uuid, preview_title text, preview_image_url text, comment_body text, review_album_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    n.id, n.kind, n.created_at, n.read_at is not null,
    a.id, a.username, a.display_name, a.avatar_url,
    n.post_id, coalesce(lp.title, alb.title), coalesce(lp.image_url, alb.image_url),
    left(c.body, 140),
    r.album_id
  from public.notifications n
  join public.profiles a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  left join public.comments c on c.id = n.comment_id
  left join public.album_reviews r on r.id = n.review_id
  left join public.link_previews alb on alb.id = r.album_id
  where n.user_id = auth.uid()
    and (p_filter <> 'replies' or n.kind in ('comment', 'reply', 'comment_reply'))
    and (p_before is null or n.id < p_before)
    and not public.is_blocked_with(n.actor_id)
    -- Post de comunidade fechada de que saí: a notificação some.
    and (p.id is null or public.community_visible(p.community_id))
  order by n.id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

-- vibes_of
CREATE OR REPLACE FUNCTION public.vibes_of(p_author uuid)
 RETURNS TABLE(id uuid, kind text, media_path text, duration_ms integer, text text, style text, created_at timestamp with time zone, seen boolean, view_count integer, preview_url text, preview_platform text, preview_title text, preview_artist text, preview_image_url text, post_id uuid, post_body text, post_author_username text, post_author_avatar_url text, text_x real, text_y real, preview_audio_url text, text_items jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    v.id, v.kind, v.media_path, v.duration_ms, v.text, v.style, v.created_at,
    exists (select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()),
    -- Quantas pessoas viram: só para o autor.
    case when v.author_id = auth.uid() then (select count(*)::int from public.vibe_views w where w.vibe_id = v.id) end,
    coalesce(lp.url, plp.url), coalesce(lp.platform, plp.platform), coalesce(lp.title, plp.title),
    coalesce(lp.artist, plp.artist), coalesce(lp.image_url, plp.image_url),
    v.post_id, left(sp.body, 200), spa.username, spa.avatar_url,
    v.text_x, v.text_y,
    coalesce(lp.audio_url, plp.audio_url),
    v.text_items
  from public.vibes v
  left join public.link_previews lp on lp.id = v.link_preview_id
  left join public.posts sp on sp.id = v.post_id
  left join public.profiles spa on spa.id = sp.author_id
  left join public.link_previews plp on plp.id = sp.link_preview_id
  where v.author_id = p_author
    and private.vibe_active(v.created_at)
    and not public.content_hidden(v.author_id)
    -- Post compartilhado de alguém com quem eu tenho bloqueio: não aparece.
    and (sp.author_id is null or not public.content_hidden(sp.author_id))
    and (sp.id is null or public.community_visible(sp.community_id))
  order by v.created_at, v.id
  limit 100;
$function$;

-- vibe_create
CREATE OR REPLACE FUNCTION public.vibe_create(p_kind text, p_media_path text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_text text DEFAULT NULL::text, p_style text DEFAULT 'violet'::text, p_link_preview_id uuid DEFAULT NULL::uuid, p_post_id uuid DEFAULT NULL::uuid, p_text_x real DEFAULT NULL::real, p_text_y real DEFAULT NULL::real, p_text_items jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := auth.uid();
  v_post_author uuid;
  v_id uuid;
  v_text text := nullif(btrim(p_text), '');
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_authenticated';
  end if;

  -- Vários textos: o campo text guarda os textos juntos (moderação e vibe de texto).
  if p_text_items is not null then
    if not private.vibe_text_items_ok(p_text_items) then
      raise exception 'invalid_text_items';
    end if;
    select left(string_agg(btrim(i ->> 't'), E'\n'), 300) into v_text from jsonb_array_elements(p_text_items) i;
  end if;

  if p_media_path is not null then
    -- O arquivo tem que ser meu, ter passado pela Edge Function (existir no bucket) e não
    -- estar em outra vibe.
    if split_part(p_media_path, '/', 1) <> v_me::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'vibes' and o.name = p_media_path)
       or exists (select 1 from public.vibes v where v.media_path = p_media_path) then
      raise exception 'invalid_media';
    end if;
  end if;

  if p_post_id is not null then
    -- Post de comunidade fechada não vira vibe (quem vê a vibe pode não ser da comunidade).
    select author_id into v_post_author from public.posts
    where id = p_post_id
      and (community_id is null or exists (select 1 from public.communities c where c.id = community_id and c.visibility = 'open'))
      and public.community_visible(community_id);
    if v_post_author is null or public.content_hidden(v_post_author) then
      raise exception 'not_found';
    end if;
  end if;

  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;

  -- Limpa as minhas vibes vencidas (a mídia sai na próxima vez que a Edge Function rodar).
  delete from public.vibes where author_id = v_me and not private.vibe_active(created_at);

  insert into public.vibes (author_id, kind, media_path, duration_ms, text, style, link_preview_id, post_id, text_x, text_y, text_items)
  values (v_me, p_kind, p_media_path, p_duration_ms, v_text, coalesce(p_style, 'violet'), p_link_preview_id, p_post_id,
          -- Posição única só vale para o texto antigo (sem lista); com lista, cada texto tem a sua.
          case when v_text is not null and p_text_items is null then p_text_x end,
          case when v_text is not null and p_text_items is null then p_text_y end,
          p_text_items)
  returning id into v_id;
  return v_id;
end;
$function$;

-- ---------------------------------------------------------------- permissões

revoke execute on function
  public.community_create(text, text, text, text, text[], text[], int),
  public.community_update(uuid, text, text, text, text[], text[], int),
  public.community_delete(uuid),
  public.community_join(uuid),
  public.community_leave(uuid),
  public.community_respond(uuid, uuid, boolean),
  public.community_ban(uuid, uuid, boolean),
  public.community_set_role(uuid, uuid, text),
  public.community_remove_post(uuid),
  public.community_get(text),
  public.my_communities(),
  public.community_members_list(uuid, text, int, int),
  public.communities_search(text, int),
  public.communities_recommended(int),
  public.community_posts(uuid, timestamptz, uuid, int)
from public, anon;
grant execute on function
  public.community_create(text, text, text, text, text[], text[], int),
  public.community_update(uuid, text, text, text, text[], text[], int),
  public.community_delete(uuid),
  public.community_join(uuid),
  public.community_leave(uuid),
  public.community_respond(uuid, uuid, boolean),
  public.community_ban(uuid, uuid, boolean),
  public.community_set_role(uuid, uuid, text),
  public.community_remove_post(uuid),
  public.community_get(text),
  public.my_communities(),
  public.community_members_list(uuid, text, int, int),
  public.communities_search(text, int),
  public.communities_recommended(int),
  public.community_posts(uuid, timestamptz, uuid, int)
to authenticated;
