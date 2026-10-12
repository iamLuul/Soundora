-- Feed "Para você" pelo gosto de cada pessoa, feed "Seguindo" e contas sugeridas.
--
-- GOSTO (private.taste): um peso por gênero, de 0 a 1, montado com:
--   gêneros escolhidos no perfil ......................... 3
--   posts que publiquei (gêneros do post e da música) .... 2   (vale menos com o tempo: ~60 dias)
--   posts que comentei ................................... 1,5 (~30 dias)
--   posts que curti ...................................... 1   (~30 dias)
--   músicas que curti no Descobrir ....................... 1,2 (~30 dias)
-- Só conta o que aconteceu até o instante em que o feed foi aberto (p_now): curtir algo
-- enquanto rola não reordena as páginas seguintes; o gosto novo vale ao atualizar.
--
-- PARA VOCÊ (feed_for_you): posts dos últimos 14 dias (os mais novos, os do meu gosto e os de
-- quem sigo/interajo; ver "pool"), em duas faixas:
--   1) relevantes: de quem sigo, meus, de quem interajo, ou com gênero do meu gosto (no post,
--      na música ou nos gêneros do perfil do autor; gêneros parecidos contam pela metade,
--      ex.: "rock" → "indie_rock");
--   2) o resto, só depois de acabarem os relevantes (para o feed nunca ficar vazio).
--   Dentro de cada faixa: pontuação = (0,5 + gosto + seguir + interação + engajamento)
--                                       / (horas desde o post + 2) ^ 1,25
-- Sem gosto nenhum (conta sem gêneros e sem atividade), tudo é faixa 1.
--
-- SEGUINDO (feed_following): só posts de quem sigo (e os meus), do mais novo ao mais velho.
--
-- CONTAS SUGERIDAS (suggested_accounts): quem não sigo, com gêneros parecidos com o meu gosto,
-- de quem curti/comentei posts, ou seguido por quem eu sigo.

create index if not exists likes_user_created on public.likes (user_id, created_at desc);
create index if not exists comments_author_created on public.comments (author_id, created_at desc);
create index if not exists discover_swipes_user_created on public.discover_swipes (user_id, created_at desc) where liked;
create index if not exists posts_author_created on public.posts (author_id, created_at desc);
create index if not exists user_genres_genre on public.user_genres (genre);

-- ---------------------------------------------------------------- gosto

create function private.taste(p_user uuid, p_at timestamptz)
returns table (genre text, weight float8)
language sql stable security definer set search_path = '' as $$
  with signals (genre, w) as (
    select ug.genre, 3.0::float8 from public.user_genres ug where ug.user_id = p_user
    union all
    select g.genre, 2.0 * exp(-extract(epoch from (p_at - p.created_at)) / (60 * 86400.0))
    from (
      select id, genres, link_preview_id, created_at from public.posts
      where author_id = p_user and created_at <= p_at and created_at > p_at - interval '180 days'
      order by created_at desc limit 50
    ) p
    left join public.link_previews lp on lp.id = p.link_preview_id
    cross join lateral (select distinct x from unnest(p.genres || coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.5 * exp(-extract(epoch from (p_at - c.at)) / (30 * 86400.0))
    from (
      select post_id, max(created_at) as at from (
        select post_id, created_at from public.comments
        where author_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
        order by created_at desc limit 200
      ) c0 group by post_id
    ) c
    join public.posts p on p.id = c.post_id and p.author_id <> p_user
    left join public.link_previews lp on lp.id = p.link_preview_id
    cross join lateral (select distinct x from unnest(p.genres || coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.0 * exp(-extract(epoch from (p_at - l.created_at)) / (30 * 86400.0))
    from (
      select post_id, created_at from public.likes
      where user_id = p_user and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 300
    ) l
    join public.posts p on p.id = l.post_id
    left join public.link_previews lp on lp.id = p.link_preview_id
    cross join lateral (select distinct x from unnest(p.genres || coalesce(lp.genres, '{}')) x) g (genre)
    union all
    select g.genre, 1.2 * exp(-extract(epoch from (p_at - s.created_at)) / (30 * 86400.0))
    from (
      select link_preview_id, created_at from public.discover_swipes
      where user_id = p_user and liked and created_at <= p_at and created_at > p_at - interval '120 days'
      order by created_at desc limit 300
    ) s
    join public.link_previews lp on lp.id = s.link_preview_id
    cross join lateral (select distinct x from unnest(coalesce(lp.genres, '{}')) x) g (genre)
  ),
  summed as (
    select s.genre, sum(s.w) as w from signals s where s.genre is not null group by s.genre
  )
  select genre, w / max(w) over () from summed where w > 0 order by w desc limit 40;
$$;
revoke execute on function private.taste(uuid, timestamptz) from public;

-- Pedaços de um gênero para achar gêneros parecidos ("indie_rock" → "indie", "rock").
create function private.genre_tokens(p_genres text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct t), '{}')
  from unnest(p_genres) g, unnest(string_to_array(g, '_')) t
  where char_length(t) >= 3 and t not in ('and', 'the', 'music', 'new', 'old', 'classic', 'modern', 'brazilian', 'latin', 'style');
$$;
revoke execute on function private.genre_tokens(text[]) from public;

-- ---------------------------------------------------------------- Para você

create or replace function public.feed_for_you(p_limit int default 20, p_offset int default 0, p_now timestamptz default null)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
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
  -- interajo e os meus. Todos dos últimos 14 dias.
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
    (select x.id
     from (select id from following union select id from interactions union select uid from me) a
     cross join lateral (
       select p.id from public.posts p, me
       where p.author_id = a.id and p.created_at > me.at - interval '14 days' and p.created_at <= me.at
       order by p.created_at desc limit 30
     ) x)
  ),
  candidates as (
    select p.id, p.author_id, p.created_at, p.like_count, p.comment_count,
      p.genres || coalesce(lp.genres, '{}') as g
    from pool
    join public.posts p on p.id = pool.id
    left join public.link_previews lp on lp.id = p.link_preview_id
    where p.author_id not in (select id from blocked)
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
$$;

-- ---------------------------------------------------------------- Seguindo

create function public.feed_following(p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
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
    p.genres, private.post_media_json(p.id), p.type
  from page
  join public.posts p on p.id = page.id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  order by p.created_at desc, p.id desc;
$$;

-- ---------------------------------------------------------------- contas sugeridas

create function public.suggested_accounts(p_limit int default 10)
returns table (id uuid, username text, display_name text, avatar_url text, genres text[], reason text)
language sql stable security definer set search_path = '' as $$
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
      (array_agg(t.genre order by t.weight desc))[1:2] as top
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
  pool as (
    select id from genre_fit union select id from liked_authors union select id from friends_of_friends
  ),
  scored as (
    select pool.id,
      coalesce(g.w, 0) + 0.8 * ln(1 + coalesce(l.n, 0)) + 0.6 * ln(1 + coalesce(f.n, 0))
        + case when exists (select 1 from public.posts p, me where p.author_id = pool.id and p.created_at > me.at - interval '14 days') then 0.3 else 0 end
        as score,
      coalesce(g.top, '{}') as top,
      case
        when coalesce(l.n, 0) >= 2 then 'liked'
        when coalesce(g.w, 0) > 0 then 'genres'
        else 'friends'
      end as reason
    from pool
    left join genre_fit g on g.id = pool.id
    left join liked_authors l on l.id = pool.id
    left join friends_of_friends f on f.id = pool.id
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, s.top, s.reason
  from scored s
  join public.profiles pr on pr.id = s.id
  order by s.score desc, pr.created_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

revoke execute on function public.feed_following(timestamptz, uuid, int), public.suggested_accounts(int) from public, anon;
grant execute on function public.feed_following(timestamptz, uuid, int), public.suggested_accounts(int) to authenticated;
