-- Silenciar perfil: as publicações da pessoa (posts, reviews, vibes) somem dos meus feeds e ela
-- não me manda mais notificações. Diferente do bloqueio: ela não fica sabendo, continua podendo
-- me seguir e ver o que eu posto, e o perfil dela abre normalmente se eu entrar nele.

create table public.muted_users (
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id),
  check (user_id <> muted_id)
);
create index muted_users_muted on public.muted_users (muted_id);
alter table public.muted_users enable row level security;
-- Cada um vê só a própria lista; ninguém grava direto (só pela set_user_muted).
create policy "meus silenciados" on public.muted_users for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.muted_users from anon, authenticated;

create function public.set_user_muted(p_user uuid, p_muted boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user is null or p_user = uid or p_muted is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not private.hit(uid, 'mute_user', 60, interval '1 hour') then
    raise exception 'rate_limited'
      using errcode = 'P0001', detail = coalesce(private.retry_after(uid, 'mute_user', interval '1 hour'), 60)::text;
  end if;
  if p_muted then
    insert into public.muted_users (user_id, muted_id) values (uid, p_user) on conflict do nothing;
  else
    delete from public.muted_users where user_id = uid and muted_id = p_user;
  end if;
end;
$$;

-- Lista da tela Configurações › Contas silenciadas.
create function public.my_muted_profiles()
returns table (id uuid, username text, display_name text, avatar_url text, muted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url, m.created_at
  from public.muted_users m
  join public.profiles pr on pr.id = m.muted_id
  where m.user_id = auth.uid()
  order by m.created_at desc
  limit 500;
$$;

revoke execute on function public.set_user_muted(uuid, boolean), public.my_muted_profiles() from public, anon;
grant execute on function public.set_user_muted(uuid, boolean), public.my_muted_profiles() to authenticated;

-- Notificação de quem eu silenciei não chega.
create function private.tg_notification_muted_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.muted_users m where m.user_id = new.user_id and m.muted_id = new.actor_id) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_notification_muted_user() from public;
create trigger muted_user before insert on public.notifications
  for each row execute function private.tg_notification_muted_user();

-- Os feeds deixam de fora quem eu silenciei (mesmas funções de antes, com essa regra a mais).

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
    union
    -- Silenciados: somem dos feeds (sem bloquear e sem a pessoa saber).
    select m.muted_id from public.muted_users m, me where m.user_id = me.uid
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

-- feed_reviews_for_you
CREATE OR REPLACE FUNCTION public.feed_reviews_for_you(p_limit integer DEFAULT 15, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, rating numeric, body text, like_count integer, liked_by_me boolean, created_at timestamp with time zone, author_id uuid, author_username text, author_display_name text, author_avatar_url text, album_id uuid, album_title text, album_artist text, album_image_url text, album_url text, album_platform text, album_year integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  taste as (select t.genre, t.weight from me, private.taste(me.uid, me.at) t),
  terms as (select t.term, t.kind, t.weight from me, private.taste_terms(me.uid, me.at) t),
  artist_list as (select coalesce(array_agg(t.term), '{}') as a from terms t where t.kind = 'artist'),
  following as (select f.followee_id as id from public.follows f, me where f.follower_id = me.uid),
  blocked as (
    select b.blocked_id as id from public.blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
    union
    -- Silenciados: somem dos feeds (sem bloquear e sem a pessoa saber).
    select m.muted_id from public.muted_users m, me where m.user_id = me.uid
  ),
  hidden_private as (
    select pr.id from public.profiles pr, me
    where pr.is_private and pr.id <> me.uid
      and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.followee_id = pr.id)
  ),
  muted as (select coalesce(array_agg(m.genre), '{}') as g from public.muted_genres m, me where m.user_id = me.uid),
  -- Reviews que podem entrar: as mais curtidas dos últimos 6 meses, as de álbuns de artistas e
  -- gêneros do meu gosto e as recentes de quem eu sigo.
  pool as (
    (select r.id from public.album_reviews r, me
     where r.created_at > me.at - interval '180 days' and r.created_at <= me.at and r.like_count > 0
     order by r.like_count desc, r.created_at desc limit 300)
    union
    (select r.id from public.link_previews lp join public.album_reviews r on r.album_id = lp.id, me
     where lp.artist_keys && (select a from artist_list)
       and r.created_at > me.at - interval '365 days' and r.created_at <= me.at
     order by r.like_count desc, r.created_at desc limit 200)
    union
    (select r.id from public.link_previews lp join public.album_reviews r on r.album_id = lp.id, me
     where lp.genres && (select coalesce(array_agg(t.genre), '{}') from taste t)
       and r.created_at > me.at - interval '365 days' and r.created_at <= me.at
     order by r.like_count desc, r.created_at desc limit 200)
    union
    (select r.id from public.album_reviews r join following f on f.id = r.author_id, me
     where r.created_at > me.at - interval '60 days' and r.created_at <= me.at
     order by r.created_at desc limit 100)
  ),
  candidates as (
    select r.id, r.album_id, r.author_id, r.like_count, r.created_at, r.terms,
      coalesce(lp.genres, '{}') as g,
      lp.artist_keys as artists,
      private.terms(lp.title) as title_terms
    from pool
    join public.album_reviews r on r.id = pool.id
    join public.link_previews lp on lp.id = r.album_id, me
    where r.author_id <> me.uid
      and r.author_id not in (select b.id from blocked b)
      and r.author_id not in (select h.id from hidden_private h)
      and not (coalesce(lp.genres, '{}') && (select m.g from muted m))
      and not exists (select 1 from public.review_likes l where l.review_id = r.id and l.user_id = me.uid)
  ),
  genre_match as (
    select c.id, sum(t.weight) as w from candidates c, unnest(c.g) x join taste t on t.genre = x group by c.id
  ),
  artist_match as (
    select c.id, sum(t.weight) as w from candidates c, unnest(c.artists) x join terms t on t.kind = 'artist' and t.term = x group by c.id
  ),
  word_match as (
    select c.id, sum(t.weight) as w
    from candidates c, unnest(c.terms || c.title_terms) x join terms t on t.kind = 'word' and t.term = x
    group by c.id
  ),
  scored as (
    select c.id, c.album_id, c.created_at,
      (
        0.3
        + least(coalesce(gm.w, 0), 2)
        + 1.5 * least(coalesce(am.w, 0), 1)
        + 0.5 * least(coalesce(wm.w, 0), 1)
        + case when f.id is not null then 1 else 0 end
      ) * (1 + ln(1 + c.like_count))
      / power(extract(epoch from ((select at from me) - c.created_at))::float8 / 86400.0 + 3, 0.5) as score,
      coalesce(gm.w, 0) + coalesce(am.w, 0) + coalesce(wm.w, 0) > 0 or f.id is not null as relevant,
      c.like_count
    from candidates c
    left join genre_match gm on gm.id = c.id
    left join artist_match am on am.id = c.id
    left join word_match wm on wm.id = c.id
    left join following f on f.id = c.author_id
  ),
  -- Uma por álbum (a de maior pontuação). Fora do gosto, só as bem curtidas (2+).
  best as (
    select s.*, row_number() over (partition by s.album_id order by s.score desc, s.created_at desc, s.id) as n
    from scored s
    where s.relevant or s.like_count >= 2
  ),
  page as (
    select b.id, b.score from best b where b.n = 1
    order by b.relevant desc, b.score desc, b.created_at desc, b.id
    limit least(greatest(coalesce(p_limit, 15), 1), 30)
  )
  select r.id, r.rating, r.body, r.like_count, false, r.created_at,
         a.id, a.username, a.display_name, a.avatar_url,
         lp.id, lp.title, lp.artist, lp.image_url, lp.url, lp.platform,
         extract(year from lp.release_date)::int
  from page
  join public.album_reviews r on r.id = page.id
  join public.profiles a on a.id = r.author_id
  join public.link_previews lp on lp.id = r.album_id
  join best b on b.id = page.id
  order by b.relevant desc, page.score desc, r.created_at desc, r.id;
end;
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
    -- Silenciados: somem dos feeds (sem bloquear e sem a pessoa saber).
    select m.muted_id from public.muted_users m, me where m.user_id = me.uid
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
      and not exists (select 1 from public.muted_users m where m.user_id = me.uid and m.muted_id = f.followee_id)
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

-- reviews_following
CREATE OR REPLACE FUNCTION public.reviews_following(p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, rating numeric, body text, like_count integer, liked_by_me boolean, created_at timestamp with time zone, author_id uuid, author_username text, author_display_name text, author_avatar_url text, album_id uuid, album_title text, album_artist text, album_image_url text, album_url text, album_platform text, album_year integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and not exists (select 1 from public.muted_users m where m.user_id = v_me and m.muted_id = f.followee_id)
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
$function$;

-- vibes_tray
CREATE OR REPLACE FUNCTION public.vibes_tray()
 RETURNS TABLE(author_id uuid, username text, display_name text, avatar_url text, vibe_count integer, unseen boolean, latest_at timestamp with time zone, is_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with authors as (
    select auth.uid() as id
    union
    select f.followee_id from public.follows f where f.follower_id = auth.uid()
  )
  select
    p.id, p.username, p.display_name, p.avatar_url,
    count(v.id)::int,
    bool_or(v.author_id <> auth.uid() and not exists (
      select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()
    )),
    max(v.created_at),
    p.id = auth.uid()
  from authors a
  join public.profiles p on p.id = a.id
  join public.vibes v on v.author_id = p.id and private.vibe_active(v.created_at)
  where not public.content_hidden(p.id)
    and not exists (select 1 from public.muted_users m where m.user_id = auth.uid() and m.muted_id = p.id)
  group by p.id
  order by (p.id = auth.uid()) desc,
           bool_or(v.author_id <> auth.uid() and not exists (
             select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()
           )) desc,
           max(v.created_at) desc
  limit 100;
$function$;
