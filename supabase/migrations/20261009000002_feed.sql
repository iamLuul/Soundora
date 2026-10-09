-- Feed "Para você", perfil e busca.

-- Um item de feed já com autor, cartão de prévia e se eu curti.
create type public.feed_item as (
  id uuid,
  body text,
  genre text,
  like_count int,
  comment_count int,
  created_at timestamptz,
  liked_by_me boolean,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  preview_url text,
  preview_platform text,
  preview_kind text,
  preview_title text,
  preview_artist text,
  preview_image_url text,
  score double precision
);

-- Ranking do MVP, por regras (sem modelo):
--   afinidade  = 3 se sigo o autor, 2 se o post é meu, +1 se o gênero do post é um dos meus
--   engajamento = ln(1 + curtidas) + 0.6 * ln(1 + comentários)
--   pontuação  = (1 + afinidade + engajamento) / (horas desde o post + 2) ^ 1.3
-- Entram posts dos últimos 14 dias, menos os de quem bloqueei ou me bloqueou.
create function public.feed_for_you(p_limit int default 20, p_offset int default 0)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid),
  my_genres as (select genre from public.user_genres, me where user_id = me.uid),
  following as (select followee_id from public.follows, me where follower_id = me.uid)
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l, me where l.post_id = p.id and l.user_id = me.uid) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    (
      1
      + case when p.author_id in (select followee_id from following) then 3 else 0 end
      + case when p.author_id = (select uid from me) then 2 else 0 end
      + case when p.genre in (select genre from my_genres) then 1 else 0 end
      + ln(1 + p.like_count) + 0.6 * ln(1 + p.comment_count)
    ) / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.3) as score
  from public.posts p
  join public.profiles a on a.id = p.author_id
  join public.link_previews lp on lp.id = p.link_preview_id
  where p.created_at > now() - interval '14 days'
    and not public.is_blocked_with(p.author_id)
  order by score desc, p.created_at desc, p.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-- Posts de um perfil, do mais novo para o mais antigo (paginação por data).
create function public.profile_posts(p_author uuid, p_before timestamptz default null, p_limit int default 20)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision
  from public.posts p
  join public.profiles a on a.id = p.author_id
  join public.link_previews lp on lp.id = p.link_preview_id
  where p.author_id = p_author
    and not public.is_blocked_with(p.author_id)
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc, p.id
  limit least(greatest(p_limit, 1), 50);
$$;

-- Cabeçalho do perfil com contadores.
create function public.profile_summary(p_username text)
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text,
  followers int, following int, posts int, is_me boolean, i_follow boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.id, pr.username, pr.display_name, pr.bio, pr.avatar_url,
    (select count(*)::int from public.follows f where f.followee_id = pr.id),
    (select count(*)::int from public.follows f where f.follower_id = pr.id),
    (select count(*)::int from public.posts p where p.author_id = pr.id),
    pr.id = auth.uid(),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
  from public.profiles pr
  where pr.username = lower(p_username)
    and not public.is_blocked_with(pr.id);
$$;

-- Busca de pessoas por username ou nome (tolerante a erro com pg_trgm).
create function public.search_profiles(p_query text, p_limit int default 20)
returns setof public.profiles
language sql stable security definer set search_path = public, extensions as $$
  select pr.*
  from public.profiles pr
  where char_length(trim(p_query)) >= 2
    and (pr.username % lower(p_query) or pr.display_name % p_query
         or pr.username ilike lower(p_query) || '%' or pr.display_name ilike '%' || p_query || '%')
    and not public.is_blocked_with(pr.id)
  order by greatest(similarity(pr.username, lower(p_query)), similarity(pr.display_name, p_query)) desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.feed_for_you(int, int) from public, anon;
revoke execute on function public.profile_posts(uuid, timestamptz, int) from public;
revoke execute on function public.profile_summary(text) from public;
revoke execute on function public.search_profiles(text, int) from public;
grant execute on function public.feed_for_you(int, int) to authenticated;
grant execute on function public.profile_posts(uuid, timestamptz, int) to anon, authenticated;
grant execute on function public.profile_summary(text) to anon, authenticated;
grant execute on function public.search_profiles(text, int) to anon, authenticated;
