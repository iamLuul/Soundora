-- Desempenho (revisão de código, out/2026).
--
-- 1) Feed "Para você" (mesma fórmula e mesma ordem; com 20 mil posts em 14 dias: ~460 ms → poucos ms):
--    - extract(epoch) devolve numeric, e numeric elevado a 1.3 é lento (~17 µs por post): float8.
--    - bloqueio calculado uma vez, não uma chamada de função por post;
--    - primeiro escolhe os posts da página só pela pontuação; os detalhes (autor, música,
--      mídia, curtida) são montados só para eles, não para os milhares do período.
create or replace function public.feed_for_you(p_limit int default 20, p_offset int default 0, p_now timestamptz default null)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  my_genres as (select coalesce(array_agg(genre), '{}') as list from public.user_genres, me where user_id = me.uid),
  following as (select followee_id from public.follows, me where follower_id = me.uid),
  -- Bloqueio nos dois sentidos, calculado uma vez (antes era uma chamada por post).
  blocked as (
    select b.blocked_id as id from public.blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id from public.blocks b, me where b.blocked_id = me.uid
  ),
  -- 1) Só a pontuação, para escolher a página (barato).
  ranked as (
    select p.id,
      (
        1
        + case when p.author_id in (select followee_id from following) then 3 else 0 end
        + case when p.author_id = (select uid from me) then 2 else 0 end
        + case when p.genres && (select list from my_genres) then 1 else 0 end
        + ln(1 + p.like_count) + 0.6 * ln(1 + p.comment_count)
      ) / power(extract(epoch from ((select at from me) - p.created_at))::float8 / 3600.0 + 2, 1.3) as score
    from public.posts p
    where p.created_at > (select at from me) - interval '14 days'
      and p.created_at <= (select at from me)
      and p.author_id not in (select id from blocked)
    order by score desc, p.created_at desc, p.id
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
  order by r.score desc, p.created_at desc, p.id;
$$;

-- 2) Índices nas chaves estrangeiras sem índice. Sem eles, apagar um post/comentário/conta
--    (ON DELETE CASCADE) ou buscar por esses campos varre a tabela inteira.
create index if not exists comments_author on public.comments (author_id);
create index if not exists notifications_post on public.notifications (post_id) where post_id is not null;
create index if not exists notifications_comment on public.notifications (comment_id) where comment_id is not null;
create index if not exists notifications_actor on public.notifications (actor_id);
create index if not exists vibes_post on public.vibes (post_id) where post_id is not null;
create index if not exists vibes_link_preview on public.vibes (link_preview_id) where link_preview_id is not null;
create index if not exists discover_swipes_preview on public.discover_swipes (link_preview_id);
create index if not exists track_lookups_preview on public.track_lookups (link_preview_id) where link_preview_id is not null;
create index if not exists featured_preview on public.featured (link_preview_id);
