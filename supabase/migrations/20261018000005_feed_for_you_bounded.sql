-- feed_for_you com custo limitado. O pedaço "posts de quem sigo, de quem interajo e meus" juntava
-- até 30 posts por pessoa: seguindo 190 contas, eram ~5.600 posts para pontuar a cada página
-- (130 a 180 ms com 20.000 posts, crescendo com o número de seguidos). Agora esse pedaço entra com
-- os 1.500 mais novos no total, e o conjunto a pontuar nunca passa de ~3.500 posts. Os posts
-- de quem sigo continuam ganhando o bônus de 2,5 e a página de cima não muda na prática.

CREATE OR REPLACE FUNCTION public.feed_for_you(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  -- Gêneros parecidos: o peso do pedaço é metade do maior peso entre os gêneros que o contêm.
  tokens as (
    select tok, max(t.weight) * 0.5 as weight
    from taste t, unnest(private.genre_tokens(array[t.genre])) tok
    group by tok
  ),
  has_taste as (select exists (select 1 from taste) as yes),
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
  -- os 1000 mais novos, os 1000 mais novos com gênero do meu gosto e os de quem sigo, de quem
  -- interajo e os meus (até 30 por pessoa, os 1.500 mais novos no total). Todos dos últimos 14 dias.
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
    select p.id, p.author_id, p.created_at, p.like_count, p.comment_count,
      p.genres || coalesce(lp.genres, '{}') as g
    from pool
    join public.posts p on p.id = pool.id
    left join public.link_previews lp on lp.id = p.link_preview_id
    where p.author_id not in (select id from blocked)
      and p.author_id not in (select id from hidden_private)
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
  scored as (
    select c.id, c.created_at, c.like_count, c.comment_count,
      f.id is not null as followed,
      c.author_id = (select uid from me) as mine,
      coalesce(i.n, 0) as inter,
      least(coalesce(pm.w, 0), 2) as post_match,
      least(coalesce(nm.w, 0), 1) as near_match,
      least(coalesce(a.w, 0), 2) as author_match
    from candidates c
    left join following f on f.id = c.author_id
    left join interactions i on i.id = c.author_id
    left join author_taste a on a.id = c.author_id
    left join post_match pm on pm.id = c.id
    left join near_match nm on nm.id = c.id
  ),
  -- 1) Só a pontuação, para escolher a página (barato).
  ranked as (
    select s.id,
      case
        when not (select yes from has_taste) then 0
        when s.followed or s.mine or s.inter > 0 or s.post_match > 0 or s.near_match > 0 or s.author_match > 0 then 0
        else 1
      end as tier,
      (
        0.5
        + s.post_match + 0.6 * s.near_match + 0.5 * s.author_match
        + case when s.followed then 2.5 else 0 end
        + case when s.mine then 2 else 0 end
        + 0.8 * ln(1 + s.inter)
        + 0.5 * ln(1 + s.like_count) + 0.3 * ln(1 + s.comment_count)
      ) / power(extract(epoch from ((select at from me) - s.created_at))::float8 / 3600.0 + 2, 1.25) as score
    from scored s
    order by tier, score desc, s.created_at desc, s.id
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  )
  -- 2) Detalhes (autor, música, mídia, curtida) só dos posts da página.
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l, me where l.post_id = p.id and l.user_id = me.uid) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    r.score,
    p.genres, private.post_media_json(p.id), p.type
  from ranked r
  join public.posts p on p.id = r.id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  order by r.tier, r.score desc, p.created_at desc, p.id;
$function$;
