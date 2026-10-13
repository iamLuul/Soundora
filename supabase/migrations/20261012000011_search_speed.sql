-- Buscar rápido com muitos dados (medido com 500 mil posts, 5 mil pessoas e 20 mil músicas):
--
-- 1. Quantos posts cada gênero tem: antes contava na hora (~0,5 s por busca, porque gêneros
--    como rock têm centenas de milhares de posts). Agora fica guardado em genre_post_counts,
--    atualizado por trigger quando um post é criado, apagado ou muda de gênero.
-- 2. Posts com a palavra: o índice trigram só ajuda com 3 letras ou mais; com 2 letras uma
--    palavra rara varria a tabela inteira (~5 s). Agora a busca em posts pede 3 letras.
-- 3. Músicas: "coalesce(artist, '') % texto" impedia o uso do índice do artista e a tabela
--    inteira de músicas era lida (~100 ms, crescendo com o catálogo). Agora usa os índices (~2 ms).

-- ---------------------------------------------------------------- 1. contagem por gênero

create table public.genre_post_counts (
  genre text primary key references public.genres (slug) on delete cascade,
  n int not null default 0 check (n >= 0)
);
alter table public.genre_post_counts enable row level security;
-- Só as funções do servidor leem e escrevem.
revoke all on public.genre_post_counts from anon, authenticated;

insert into public.genre_post_counts (genre, n)
select g, count(*) from public.posts, unnest(genres) g group by g;

create function private.tg_genre_post_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old text[] := case when tg_op in ('UPDATE', 'DELETE') then old.genres else '{}' end;
  v_new text[] := case when tg_op in ('UPDATE', 'INSERT') then new.genres else '{}' end;
begin
  if v_old is not distinct from v_new then
    return null;
  end if;
  -- Sempre na mesma ordem (por gênero), para dois posts ao mesmo tempo não travarem um ao outro.
  -- Somas e subtrações em comandos separados: o CHECK (n >= 0) vale até para a linha que o
  -- INSERT tentaria criar antes de cair no ON CONFLICT.
  with d as (
    select x.genre, sum(x.delta)::int as delta
    from (select unnest(v_new) as genre, 1 as delta union all select unnest(v_old), -1) x
    group by x.genre
  )
  insert into public.genre_post_counts as c (genre, n)
  select d.genre, d.delta from d where d.delta > 0 order by d.genre
  on conflict (genre) do update set n = c.n + excluded.n;

  with d as (
    select x.genre, sum(x.delta)::int as delta
    from (select unnest(v_new) as genre, 1 as delta union all select unnest(v_old), -1) x
    group by x.genre
  )
  update public.genre_post_counts c set n = greatest(c.n + d.delta, 0)
  from (select * from d where d.delta < 0 order by d.genre) d
  where c.genre = d.genre;
  return null;
end;
$$;
revoke execute on function private.tg_genre_post_counts() from public;
create trigger genre_counts after insert or delete or update of genres on public.posts
  for each row execute function private.tg_genre_post_counts();

create or replace function public.search_post_genres(p_query text, p_limit int default 10)
returns table (slug text, name_pt text, name_en text, post_count int)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as t),
  matches as (
    select g.slug, g.name_pt, g.name_en, g.featured, g.rank,
           (lower(g.name_en) like q.t || '%' or lower(g.name_pt) like q.t || '%' or g.slug like replace(q.t, ' ', '_') || '%') as prefix
    from public.genres g, q
    where char_length(q.t) between 1 and 60
      and (lower(g.name_en) like '%' || q.t || '%' or lower(g.name_pt) like '%' || q.t || '%' or g.slug like '%' || replace(q.t, ' ', '_') || '%')
  )
  select m.slug, m.name_pt, m.name_en, coalesce(c.n, 0)
  from matches m
  left join public.genre_post_counts c on c.genre = m.slug
  order by (coalesce(c.n, 0) > 0) desc, m.prefix desc, coalesce(c.n, 0) desc, m.featured desc, m.rank nulls last, m.slug
  limit least(greatest(p_limit, 1), 30);
$$;

-- ---------------------------------------------------------------- 2. posts: 3 letras ou mais

create or replace function public.search_posts(p_query text, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_item
language plpgsql stable security definer set search_path = '' as $$
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
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where private.fold(p.body) like pattern escape '\'
    and not public.is_blocked_with(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

-- ---------------------------------------------------------------- 3. músicas pelos índices

create or replace function public.search_tracks(p_query text, p_limit int default 20)
returns table (
  link_preview_id uuid,
  url text,
  platform text,
  kind text,
  title text,
  artist text,
  image_url text,
  post_count int
)
language sql stable security definer set search_path = '' as $$
  with found as (
    select lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
           greatest(extensions.similarity(lp.title, p_query), extensions.similarity(coalesce(lp.artist, ''), p_query)) as score
    from public.link_previews lp
    where char_length(trim(p_query)) >= 2
      -- Cada condição usa o índice trigram dela (artista nulo não entra, como antes).
      and (lp.title operator(extensions.%) p_query or lp.artist operator(extensions.%) p_query
           or lp.title ilike '%' || p_query || '%' or lp.artist ilike '%' || p_query || '%')
      and exists (select 1 from public.posts p where p.link_preview_id = lp.id)
    order by score desc, lp.title
    limit least(greatest(p_limit, 1), 50)
  )
  -- Só conta os posts das músicas que vão aparecer.
  select f.id, f.url, f.platform, f.kind, f.title, f.artist, f.image_url,
         (select count(*)::int from public.posts p where p.link_preview_id = f.id and not public.is_blocked_with(p.author_id))
  from found f
  order by f.score desc, f.title;
$$;
