-- Aba Seguindo do Início: as reviews de quem eu sigo (e as minhas), do mais novo ao mais velho,
-- para o app misturar com os posts pela data. Mesmo formato do reviews_feed.
-- Só para quem está logado; sem as de quem tem bloqueio comigo.

create function public.reviews_following(p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (
  id uuid,
  rating numeric,
  body text,
  like_count int,
  liked_by_me boolean,
  created_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  album_id uuid,
  album_title text,
  album_artist text,
  album_image_url text,
  album_url text,
  album_platform text,
  album_year int
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_limit int := least(greatest(p_limit, 1), 50);
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
  with authors as (
    select v_me as id
    union
    select f.followee_id from public.follows f
    where f.follower_id = v_me and not public.is_blocked_with(f.followee_id)
  ),
  -- As mais novas de cada pessoa (índice autor + data) e, delas, as mais novas de todas.
  page as (
    select x.id, x.created_at
    from authors a
    cross join lateral (
      select r.id, r.created_at from public.album_reviews r
      where r.author_id = a.id
        and (p_before is null or (r.created_at, r.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by r.created_at desc, r.id desc
      limit v_limit
    ) x
    order by x.created_at desc, x.id desc
    limit v_limit
  )
  select r.id, r.rating, r.body, r.like_count,
         exists (select 1 from public.review_likes l where l.review_id = r.id and l.user_id = v_me),
         r.created_at,
         a.id, a.username, a.display_name, a.avatar_url,
         lp.id, lp.title, lp.artist, lp.image_url, lp.url, lp.platform,
         extract(year from lp.release_date)::int
  from page
  join public.album_reviews r on r.id = page.id
  join public.profiles a on a.id = r.author_id
  join public.link_previews lp on lp.id = r.album_id
  order by r.created_at desc, r.id desc;
end;
$$;
revoke execute on function public.reviews_following(timestamptz, uuid, int) from public, anon;
grant execute on function public.reviews_following(timestamptz, uuid, int) to authenticated;
