-- Para você sempre renovado: cada vez que o feed é aberto (voltar para o Início, puxar para
-- atualizar), vem conteúdo novo e numa ordem diferente.
--
-- - p_seen: posts que a pessoa já viu na tela (o app guarda os últimos ~300, por 3 dias, e manda
--   ao abrir o feed). Eles vão para o fim: primeiro tudo o que ela ainda não viu.
-- - Variação por abertura: a pontuação de cada post ganha um fator de ~±15%, fixo para aquele
--   instante de abertura (p_now). As páginas de uma mesma abertura continuam coerentes (sem
--   repetir nem pular post), mas outra abertura mistura de novo os posts de pontuação parecida.
--   Curtidas e comentários feitos depois da abertura também não contam na pontuação dela.
--   A relevância continua mandando: a variação não tira um post do gosto da pessoa do topo
--   para pôr um sem relação.

drop function public.feed_for_you(int, int, timestamptz);

CREATE FUNCTION public.feed_for_you(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone, p_seen uuid[] DEFAULT '{}'::uuid[])
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
    p.genres, private.post_media_json(p.id), p.type
  from ranked r
  join public.posts p on p.id = r.id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  order by r.seen, r.tier, r.score desc, p.created_at desc, p.id;
$function$;

revoke execute on function public.feed_for_you(int, int, timestamptz, uuid[]) from public, anon;
grant execute on function public.feed_for_you(int, int, timestamptz, uuid[]) to authenticated;
