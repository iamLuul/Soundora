-- Foto da comunidade: a dona pode pôr uma imagem no lugar da inicial sobre a cor (a cor continua
-- valendo enquanto não há foto). Mesmo esquema da foto do perfil:
-- - A comunidade guarda só o caminho no bucket (community-avatars/{id}/avatar-123.webp); o app
--   monta a URL. Ninguém aponta a foto para um site de fora.
-- - Só a Edge Function profile-image (kind=community, chave secreta) grava, depois de conferir o
--   login, que a pessoa é a dona, o limite de envios e os bytes da imagem. O app não escreve
--   nem lista o bucket.

alter table public.communities add column avatar_url text;
alter table public.communities add constraint communities_avatar_path
  check (avatar_url is null or avatar_url ~ ('^community-avatars/' || id::text || '/avatar-[0-9]{10,16}\.(jpg|png|webp)$'));

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- 1 MB, só JPEG, PNG e WebP (chega com 512 px). Sem policies: abre pela URL pública.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('community-avatars', 'community-avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Usada só pela Edge Function (service_role): confere que p_user é a dona, grava o caminho (ou
-- null) e devolve o anterior, para a função apagar o arquivo velho.
create function public.community_set_avatar(p_user uuid, p_community uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_previous text;
begin
  if private.community_role(p_community, p_user) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select avatar_url into v_previous from public.communities where id = p_community for update;
  update public.communities set avatar_url = p_path where id = p_community;
  return v_previous;
end;
$$;
revoke execute on function public.community_set_avatar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.community_set_avatar(uuid, uuid, text) to service_role;

-- A foto vai junto em tudo que mostra a comunidade (o formato de retorno muda: recria).
drop function public.community_get(text);
drop function public.my_communities();
drop function public.communities_search(text, int);
drop function public.communities_recommended(int);

create function public.community_get(p_slug text)
returns table (
  id uuid, slug text, name text, description text, visibility text, color int, avatar_url text, artists text[], genres text[],
  member_count int, created_at timestamptz, my_role text, my_status text, can_view boolean, pending_count int
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.description, c.visibility, c.color, c.avatar_url, c.artists,
    coalesce((select array_agg(g.genre order by g.genre) from public.community_genres g where g.community_id = c.id), '{}'),
    c.member_count, c.created_at, m.role, m.status,
    public.community_visible(c.id),
    case when m.status = 'active' and m.role in ('owner', 'moderator')
      then (select count(*)::int from public.community_members x where x.community_id = c.id and x.status = 'pending') end
  from public.communities c
  left join public.community_members m on m.community_id = c.id and m.user_id = auth.uid()
  where c.slug = lower(btrim(p_slug)) and auth.uid() is not null;
$$;

create function public.my_communities()
returns table (id uuid, slug text, name text, color int, avatar_url text, visibility text, role text, member_count int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.color, c.avatar_url, c.visibility, m.role, c.member_count
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by lower(c.name)
  limit 200;
$$;

create function public.communities_search(p_query text, p_limit int default 20)
returns table (id uuid, slug text, name text, description text, visibility text, color int, avatar_url text, member_count int, joined boolean)
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(btrim(coalesce(p_query, ''))) as s,
      private.terms(p_query) as terms,
      (select coalesce(array_agg(k), '{}') from unnest(private.artist_names(p_query)) k) as artists
  )
  select c.id, c.slug, c.name, left(c.description, 200), c.visibility, c.color, c.avatar_url, c.member_count,
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

create function public.communities_recommended(p_limit int default 8)
returns table (id uuid, slug text, name text, description text, visibility text, color int, avatar_url text, member_count int, genres text[], reason text)
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
  select c.id, c.slug, c.name, left(c.description, 200), c.visibility, c.color, c.avatar_url, c.member_count,
    coalesce((select array_agg(g.genre order by g.genre) from public.community_genres g where g.community_id = c.id), '{}'),
    s.reason
  from scored s join public.communities c on c.id = s.id, me
  where me.uid is not null
  order by s.score desc, c.member_count desc, c.created_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

create or replace function private.post_community_json(p_community uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p_community is null then null else (
    select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'color', c.color, 'avatar_url', c.avatar_url, 'closed', c.visibility = 'closed')
    from public.communities c where c.id = p_community
  ) end;
$$;
revoke execute on function private.post_community_json(uuid) from public;

revoke execute on function
  public.community_get(text),
  public.my_communities(),
  public.communities_search(text, int),
  public.communities_recommended(int)
from public, anon;
grant execute on function
  public.community_get(text),
  public.my_communities(),
  public.communities_search(text, int),
  public.communities_recommended(int)
to authenticated;
