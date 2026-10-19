-- discover_cards mais rápida com muitos posts. A busca das sugestões da comunidade olhava todos
-- os posts dos últimos 30 dias e chamava content_hidden (bloqueio e conta privada) em cada um:
-- 190 ms com 5.000 posts e 260 ms com 20.000, crescendo junto com a rede.
-- Agora quem fica escondido é calculado uma vez (bloqueios nos dois sentidos e contas privadas
-- que não sigo) e vira um filtro por conjunto, e a busca para nos 4.000 posts mais novos que
-- passam nos filtros (o ranking já favorece os recentes). Mesmas regras de antes.

create or replace function public.discover_cards(p_limit int default 20)
returns setof public.discover_card
language sql stable security definer set search_path = '' as $$
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
$$;
