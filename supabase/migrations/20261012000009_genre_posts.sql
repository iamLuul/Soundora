-- Buscar › por gênero: achar gêneros pelo nome e ver os posts marcados com ele.
--
-- search_post_genres: gêneros do catálogo que batem com o texto, com quantos posts têm o
--   gênero (os que têm posts primeiro).
-- genre_posts: posts marcados com o gênero (posts.genres), do mais novo ao mais velho,
--   menos os de quem bloqueei ou me bloqueou. Página por (created_at, id).

create function public.search_post_genres(p_query text, p_limit int default 10)
returns table (slug text, name_pt text, name_en text, post_count int)
language sql stable security definer set search_path = '' as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as t),
  matches as (
    select g.slug, g.name_pt, g.name_en, g.featured, g.rank,
           (lower(g.name_en) like q.t || '%' or lower(g.name_pt) like q.t || '%' or g.slug like replace(q.t, ' ', '_') || '%') as prefix
    from public.genres g, q
    where char_length(q.t) between 1 and 60
      and (lower(g.name_en) like '%' || q.t || '%' or lower(g.name_pt) like '%' || q.t || '%' or g.slug like '%' || replace(q.t, ' ', '_') || '%')
    order by prefix desc, g.featured desc, g.rank nulls last, g.slug
    limit 200
  ),
  counted as (
    select m.*, (select count(*)::int from public.posts p where p.genres @> array[m.slug]) as n
    from matches m
  )
  select c.slug, c.name_pt, c.name_en, c.n
  from counted c
  order by (c.n > 0) desc, c.prefix desc, c.n desc, c.featured desc, c.rank nulls last, c.slug
  limit least(greatest(p_limit, 1), 30);
$$;

create function public.genre_posts(p_genre text, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_item
language plpgsql stable security definer set search_path = '' as $$
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
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.genres @> array[p_genre]
    and not public.is_blocked_with(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

revoke execute on function public.search_post_genres(text, int), public.genre_posts(text, timestamptz, uuid, int) from public, anon;
grant execute on function public.search_post_genres(text, int), public.genre_posts(text, timestamptz, uuid, int) to authenticated;
