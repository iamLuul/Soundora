-- Configurações da conta: gênero (da pessoa), gêneros silenciados e quais notificações chegam.

-------------------------------------------------------------------------------
-- Gênero: opcional, só a própria pessoa vê (fica em profile_private, como a data de nascimento).
-- null = não informado ("Prefiro não dizer").
-------------------------------------------------------------------------------
alter table public.profile_private add column gender text
  check (gender in ('female', 'male', 'non_binary', 'other'));

create function public.set_gender(p_gender text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_gender is not null and p_gender not in ('female', 'male', 'non_binary', 'other') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.profile_private set gender = p_gender where user_id = auth.uid();
end;
$$;

-- Dados da tela "Sua conta" (só da própria pessoa). O e-mail vem da sessão, no app.
create function public.my_account()
returns table (created_at timestamptz, birthdate date, age int, is_minor boolean, has_guardian boolean, gender text, is_private boolean)
language sql stable security definer set search_path = '' as $$
  select pr.created_at, pp.birthdate, extract(year from age(pp.birthdate))::int, pp.is_minor,
         pp.guardian_user_id is not null, pp.gender, pr.is_private
  from public.profiles pr
  join public.profile_private pp on pp.user_id = pr.id
  where pr.id = auth.uid();
$$;

-------------------------------------------------------------------------------
-- Gêneros silenciados: somem do Para você e do Descobrir (a busca por gênero continua mostrando).
-------------------------------------------------------------------------------
create table public.muted_genres (
  user_id uuid not null references public.profiles (id) on delete cascade,
  genre text not null references public.genres (slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, genre)
);
alter table public.muted_genres enable row level security;
create policy "meus gêneros silenciados" on public.muted_genres for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.muted_genres from anon, authenticated;

-- Troca a lista inteira (até 50).
create function public.set_muted_genres(p_genres text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  wanted text[] := coalesce(p_genres, '{}');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if cardinality(wanted) > 50 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(wanted) g where not exists (select 1 from public.genres x where x.slug = g)) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not private.hit(uid, 'muted_genres', 60, interval '1 hour') then
    raise exception 'rate_limited'
      using errcode = 'P0001', detail = coalesce(private.retry_after(uid, 'muted_genres', interval '1 hour'), 60)::text;
  end if;
  delete from public.muted_genres where user_id = uid and genre <> all (wanted);
  insert into public.muted_genres (user_id, genre) select uid, g from unnest(wanted) g on conflict do nothing;
end;
$$;

-------------------------------------------------------------------------------
-- Notificações: a pessoa escolhe quais tipos quer receber. Tipo desligado = nem entra na
-- lista (nem vai para o celular). Pedidos para seguir continuam em Privacidade › Pedidos.
-------------------------------------------------------------------------------
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  muted_kinds text[] not null default '{}' check (muted_kinds <@ array[
    'like', 'comment', 'reply', 'follow', 'comment_reply', 'comment_like', 'review_like', 'follow_request', 'follow_accepted']::text[])
);
alter table public.notification_settings enable row level security;
create policy "minhas notificações" on public.notification_settings for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.notification_settings from anon, authenticated;

create function public.set_notification_settings(p_muted_kinds text[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.notification_settings (user_id, muted_kinds)
  values (auth.uid(), (select coalesce(array_agg(distinct k), '{}') from unnest(coalesce(p_muted_kinds, '{}')) k))
  on conflict (user_id) do update set muted_kinds = excluded.muted_kinds;
exception when check_violation then
  raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;

create function private.tg_notification_muted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notification_settings s where s.user_id = new.user_id and new.kind = any (s.muted_kinds)) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_notification_muted() from public;
create trigger muted before insert on public.notifications
  for each row execute function private.tg_notification_muted();

revoke execute on function public.set_gender(text), public.my_account(), public.set_muted_genres(text[]),
  public.set_notification_settings(text[]) from public, anon;
grant execute on function public.set_gender(text), public.my_account(), public.set_muted_genres(text[]),
  public.set_notification_settings(text[]) to authenticated;

-------------------------------------------------------------------------------
-- Descobrir e Para você: sem gêneros silenciados (e, no Para você, sem conta privada que eu
-- não sigo; o Descobrir já passou a usar content_hidden na migration anterior).
-------------------------------------------------------------------------------
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
  community as (
    select distinct on (p.link_preview_id)
      p.link_preview_id, p.genre, p.id as post_id, p.author_id, p.like_count, p.created_at
    from public.posts p, me
    where p.created_at > now() - interval '30 days'
      and p.author_id <> me.uid
      and p.author_id not in (select followee_id from public.follows where follower_id = me.uid)
      and not public.content_hidden(p.author_id)
      and p.link_preview_id not in (select link_preview_id from seen)
      and p.link_preview_id not in (select link_preview_id from feat)
      and not (p.genres && (select coalesce(array_agg(genre), '{}') from muted))
      and (p.genre is null or p.genre not in (select genre from muted))
      and (p.genre in (select genre from my_genres) or not exists (select 1 from my_genres))
    order by p.link_preview_id, p.like_count desc, p.created_at desc
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
