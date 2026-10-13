-- Conta privada (com pedidos para seguir).
--
-- Conta privada: só quem a pessoa aprovou vê os posts, reviews, vibes, curtidas do Descobrir e
-- as listas de seguidores. O cabeçalho do perfil (nome, @, foto, bio, gêneros, favoritas e os
-- números) continua visível, como em outras redes. Seguir uma conta privada vira um pedido,
-- que a pessoa aceita ou recusa; ao voltar a ser pública, os pedidos pendentes são aceitos.
--
-- Em todo lugar onde o banco escondia o conteúdo de quem está bloqueado (is_blocked_with do
-- AUTOR), agora entra public.content_hidden(autor): bloqueado OU conta privada que eu não sigo.
-- As checagens sobre a pessoa em si (perfil, quem curtiu, quem comentou) continuam só com o
-- bloqueio: um comentário de conta privada num post público continua aparecendo.

alter table public.profiles add column is_private boolean not null default false;
create index profiles_private on public.profiles (id) where is_private;

-- Conteúdo de `p_author` escondido de quem está logado (anon: sem login).
create function public.content_hidden(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_author = auth.uid() then false
    else public.is_blocked_with(p_author)
      or exists (
        select 1 from public.profiles pr
        where pr.id = p_author and pr.is_private
          and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p_author)
      )
  end;
$$;
revoke execute on function public.content_hidden(uuid) from public;
grant execute on function public.content_hidden(uuid) to authenticated, service_role;

-------------------------------------------------------------------------------
-- Regras de acesso direto às tabelas
-------------------------------------------------------------------------------
drop policy "posts visíveis" on public.posts;
create policy "posts visíveis" on public.posts for select to authenticated
  using (not public.content_hidden(author_id));

drop policy "reviews visíveis" on public.album_reviews;
create policy "reviews visíveis" on public.album_reviews for select to authenticated
  using (not public.content_hidden(author_id));

-- Comentários: o autor do comentário (bloqueio) e o post (conta privada do dono do post).
drop policy "comentários visíveis" on public.comments;
create policy "comentários visíveis" on public.comments for select to authenticated
  using (
    not public.is_blocked_with(author_id)
    and exists (select 1 from public.posts p where p.id = post_id and not public.content_hidden(p.author_id))
  );

-- Curtidas: só de posts que eu posso ver.
drop policy "curtidas são públicas" on public.likes;
create policy "curtidas de posts visíveis" on public.likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and not public.content_hidden(p.author_id)));

drop policy "curtir" on public.likes;
create policy "curtir" on public.likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and not public.content_hidden(p.author_id))
  );

drop policy "comentar" on public.comments;
create policy "comentar" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and not public.content_hidden(p.author_id))
  );

drop policy "curtir comentário" on public.comment_likes;
create policy "curtir comentário" on public.comment_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.comments c join public.posts p on p.id = c.post_id
      where c.id = comment_id and not public.is_blocked_with(c.author_id) and not public.content_hidden(p.author_id)
    )
  );

drop policy "curtir review" on public.review_likes;
create policy "curtir review" on public.review_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.album_reviews r where r.id = review_id and not public.content_hidden(r.author_id))
  );

-- Seguir direto só conta pública; conta privada passa por request_follow.
drop policy "seguir" on public.follows;
create policy "seguir" on public.follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and not public.is_blocked_with(followee_id)
    and not exists (select 1 from public.profiles pr where pr.id = followee_id and pr.is_private)
  );

-------------------------------------------------------------------------------
-- Pedidos para seguir
-------------------------------------------------------------------------------
create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index follow_requests_target on public.follow_requests (target_id, created_at desc);
alter table public.follow_requests enable row level security;
-- Cada um vê os pedidos que fez e os que recebeu; mudanças só pelas funções abaixo.
create policy "meus pedidos" on public.follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
revoke insert, update, delete on public.follow_requests from anon, authenticated;

create trigger rate_limit before insert on public.follow_requests
  for each row execute function private.tg_rate_limit('follow_request', '100', '1 hour');
create trigger block_suspended before insert on public.follow_requests
  for each row execute function private.tg_block_suspended('requester_id');

-- Bloquear apaga os pedidos nos dois sentidos (como já desfaz o "seguir").
create function private.tg_block_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follow_requests
  where (requester_id = new.blocker_id and target_id = new.blocked_id)
     or (requester_id = new.blocked_id and target_id = new.blocker_id);
  return null;
end $$;
revoke execute on function private.tg_block_requests() from public;
create trigger blocks_requests after insert on public.blocks
  for each row execute function private.tg_block_requests();

-------------------------------------------------------------------------------
-- Notificações: pedido recebido e pedido aceito
-------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'like', 'comment', 'reply', 'follow', 'comment_reply', 'comment_like', 'review_like', 'follow_request', 'follow_accepted'));
alter table public.notifications drop constraint notifications_post_check;
alter table public.notifications add constraint notifications_post_check
  check ((kind in ('follow', 'review_like', 'follow_request', 'follow_accepted')) = (post_id is null));
create unique index notifications_follow_request_once on public.notifications (user_id, actor_id) where kind = 'follow_request';
create unique index notifications_follow_accepted_once on public.notifications (user_id, actor_id) where kind = 'follow_accepted';

create function private.tg_notify_follow_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where kind = 'follow_request' and actor_id = old.requester_id and user_id = old.target_id;
    return old;
  end if;
  if private.blocked_between(new.target_id, new.requester_id) then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, kind)
  values (new.target_id, new.requester_id, 'follow_request')
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.tg_notify_follow_request() from public;
create trigger notify after insert or delete on public.follow_requests
  for each row execute function private.tg_notify_follow_request();

-- Seguir que veio de um pedido aceito: quem aceitou não recebe "começou a seguir você".
create or replace function private.tg_notify_follow()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where kind in ('follow', 'follow_accepted')
      and ((actor_id = old.follower_id and user_id = old.followee_id) or (actor_id = old.followee_id and user_id = old.follower_id and kind = 'follow_accepted'));
    return old;
  end if;
  if private.blocked_between(new.followee_id, new.follower_id) then
    return new;
  end if;
  if coalesce(current_setting('soundora.follow_accept', true), '') = 'on' then
    insert into public.notifications (user_id, actor_id, kind)
    values (new.follower_id, new.followee_id, 'follow_accepted')
    on conflict do nothing;
  else
    insert into public.notifications (user_id, actor_id, kind)
    values (new.followee_id, new.follower_id, 'follow')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.push_text(p_kind text, p_locale text, p_username text, p_comment text)
returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_locale = 'en' then case p_kind
      when 'like' then jsonb_build_object('title', 'New like', 'body', '@' || p_username || ' liked your post')
      when 'comment' then jsonb_build_object('title', '@' || p_username || ' commented', 'body', left(coalesce(p_comment, ''), 120))
      when 'reply' then jsonb_build_object('title', '@' || p_username || ' also commented', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_reply' then jsonb_build_object('title', '@' || p_username || ' replied to you', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_like' then jsonb_build_object('title', 'New like', 'body', '@' || p_username || ' liked your comment')
      when 'review_like' then jsonb_build_object('title', 'New like', 'body', '@' || p_username || ' liked your review')
      when 'follow_request' then jsonb_build_object('title', 'Follow request', 'body', '@' || p_username || ' wants to follow you')
      when 'follow_accepted' then jsonb_build_object('title', 'Request accepted', 'body', '@' || p_username || ' accepted your follow request')
      else jsonb_build_object('title', 'New follower', 'body', '@' || p_username || ' started following you')
    end
    else case p_kind
      when 'like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu post')
      when 'comment' then jsonb_build_object('title', '@' || p_username || ' comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'reply' then jsonb_build_object('title', '@' || p_username || ' também comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_reply' then jsonb_build_object('title', '@' || p_username || ' respondeu você', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu comentário')
      when 'review_like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu sua review')
      when 'follow_request' then jsonb_build_object('title', 'Pedido para seguir', 'body', '@' || p_username || ' quer seguir você')
      when 'follow_accepted' then jsonb_build_object('title', 'Pedido aceito', 'body', '@' || p_username || ' aceitou seu pedido para seguir')
      else jsonb_build_object('title', 'Novo seguidor', 'body', '@' || p_username || ' começou a seguir você')
    end
  end;
$$;

-------------------------------------------------------------------------------
-- Funções do app
-------------------------------------------------------------------------------

-- Seguir: conta pública segue na hora ('following'); privada vira pedido ('requested').
create function public.request_follow(p_target uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_target = uid or public.is_blocked_with(p_target) or not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.follows where follower_id = uid and followee_id = p_target) then
    return 'following';
  end if;
  if exists (select 1 from public.profiles where id = p_target and is_private) then
    insert into public.follow_requests (requester_id, target_id) values (uid, p_target) on conflict do nothing;
    return 'requested';
  end if;
  insert into public.follows (follower_id, followee_id) values (uid, p_target) on conflict do nothing;
  return 'following';
end;
$$;

-- Desiste do pedido (ou o pedido já não existe: nada acontece).
create function public.cancel_follow_request(p_target uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from public.follow_requests where requester_id = auth.uid() and target_id = p_target;
$$;

-- Aceitar (vira seguidor) ou recusar um pedido recebido.
create function public.respond_follow_request(p_requester uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = uid;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if p_accept and not public.is_blocked_with(p_requester) then
    perform set_config('soundora.follow_accept', 'on', true);
    insert into public.follows (follower_id, followee_id) values (p_requester, uid) on conflict do nothing;
    perform set_config('soundora.follow_accept', '', true);
  end if;
end;
$$;

-- Pedidos recebidos (os mais novos primeiro).
create function public.my_follow_requests(p_limit int default 50, p_offset int default 0)
returns table (id uuid, username text, display_name text, avatar_url text, requested_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url, r.created_at
  from public.follow_requests r
  join public.profiles pr on pr.id = r.requester_id
  where r.target_id = auth.uid() and not public.is_blocked_with(pr.id)
  order by r.created_at desc, pr.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- Liga/desliga a conta privada. Ao abrir a conta, os pedidos pendentes viram seguidores.
create function public.set_private(p_private boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r record;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.profiles set is_private = p_private where id = uid;
  if not p_private then
    for r in delete from public.follow_requests where target_id = uid returning requester_id loop
      if not public.is_blocked_with(r.requester_id) then
        perform set_config('soundora.follow_accept', 'on', true);
        insert into public.follows (follower_id, followee_id) values (r.requester_id, uid) on conflict do nothing;
        perform set_config('soundora.follow_accept', '', true);
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function public.request_follow(uuid), public.cancel_follow_request(uuid),
  public.respond_follow_request(uuid, boolean), public.my_follow_requests(int, int), public.set_private(boolean)
  from public, anon;
grant execute on function public.request_follow(uuid), public.cancel_follow_request(uuid),
  public.respond_follow_request(uuid, boolean), public.my_follow_requests(int, int), public.set_private(boolean)
  to authenticated;

-- Perfil: agora diz se é privado, se eu já pedi para seguir e se o conteúdo está trancado para mim.
drop function public.profile_summary(text);
create function public.profile_summary(p_username text)
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text, banner_url text,
  followers int, following int, posts int, likes int, is_me boolean, i_follow boolean,
  is_private boolean, requested boolean, locked boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.id, pr.username, pr.display_name, pr.bio, pr.avatar_url, pr.banner_url,
    (select count(*)::int from public.follows f where f.followee_id = pr.id),
    (select count(*)::int from public.follows f where f.follower_id = pr.id),
    (select count(*)::int from public.posts p where p.author_id = pr.id),
    (select count(*)::int from public.discover_swipes s where s.user_id = pr.id and s.liked),
    pr.id = auth.uid(),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id),
    pr.is_private,
    exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = pr.id),
    public.content_hidden(pr.id)
  from public.profiles pr
  where pr.username = lower(p_username)
    and not public.is_blocked_with(pr.id);
$$;
revoke execute on function public.profile_summary(text) from public, anon;
grant execute on function public.profile_summary(text) to authenticated;

-- Seguidores e seguindo de conta privada: só para quem a segue.
create or replace function public.profile_people(p_username text, p_list text, p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, username text, display_name text, avatar_url text, bio text, i_follow boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with target as (
    select pr.id from public.profiles pr
    where pr.username = lower(p_username) and not public.content_hidden(pr.id)
  ), people as (
    select case when p_list = 'followers' then f.follower_id else f.followee_id end as person, f.created_at
    from public.follows f, target t
    where (p_list = 'followers' and f.followee_id = t.id) or (p_list = 'following' and f.follower_id = t.id)
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.bio,
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id),
         pr.id = auth.uid()
  from people x
  join public.profiles pr on pr.id = x.person
  where not public.is_blocked_with(pr.id)
  order by x.created_at desc, pr.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-------------------------------------------------------------------------------
-- Funções que mostram conteúdo de um autor: is_blocked_with(autor) → content_hidden(autor).
-- (Mesmas definições de antes, só com essa troca nos pontos indicados.)
-------------------------------------------------------------------------------

-- public.discover_cards(integer): p.author_id (1x)
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
  feat as (
    select distinct on (f.link_preview_id)
      f.link_preview_id, f.genre,
      case when (select locale from me) = 'en' then coalesce(f.note_en, f.note_pt) else coalesce(f.note_pt, f.note_en) end as note,
      0 as bucket,
      (case when f.genre in (select genre from my_genres) then 0 else 1 end) * 100000 + f.position as rank
    from public.featured f
    where f.starts_at <= now() and (f.ends_at is null or f.ends_at > now())
      and f.link_preview_id not in (select link_preview_id from seen)
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

-- public.discover_swipe(uuid,boolean,uuid): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.discover_swipe(p_link_preview_id uuid, p_liked boolean, p_post_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.discover_swipes (user_id, link_preview_id, liked)
  values (auth.uid(), p_link_preview_id, p_liked)
  on conflict (user_id, link_preview_id) do update set liked = excluded.liked, created_at = now();

  if p_liked and p_post_id is not null then
    insert into public.likes (user_id, post_id)
    select auth.uid(), p.id from public.posts p
    where p.id = p_post_id and p.link_preview_id = p_link_preview_id and not public.content_hidden(p.author_id)
    on conflict do nothing;
  end if;
end $function$;

-- public.trending_tracks(integer,text,integer): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.trending_tracks(p_days integer DEFAULT 7, p_genre text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, link_preview_id uuid, url text, platform text, kind text, title text, artist text, image_url text, post_count integer, like_count integer, score integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recent as (
    select p.*
    from public.posts p
    where p.created_at > now() - make_interval(days => least(greatest(p_days, 1), 30))
      and (p_genre is null or p.genre = p_genre)
      and not public.content_hidden(p.author_id)
  ),
  agg as (
    select link_preview_id,
           count(distinct author_id)::int as post_count,
           coalesce(sum(like_count), 0)::int as like_count
    from recent
    group by link_preview_id
  )
  select
    (row_number() over (order by a.post_count * 3 + a.like_count desc, a.post_count desc, lp.title))::int,
    lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    a.post_count, a.like_count, a.post_count * 3 + a.like_count
  from agg a
  join public.link_previews lp on lp.id = a.link_preview_id
  order by 1
  limit least(greatest(p_limit, 1), 100);
$function$;

-- public.search_tracks(text,integer): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.search_tracks(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(link_preview_id uuid, url text, platform text, kind text, title text, artist text, image_url text, post_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with found as (
    select lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
           greatest(extensions.similarity(lp.title, p_query), extensions.similarity(coalesce(lp.artist, ''), p_query)) as score
    from public.link_previews lp
    where char_length(trim(p_query)) >= 2
      -- Cada condição usa o índice trigram dela (artista nulo não entra, como antes).
      and (lp.title operator(extensions.%) p_query or lp.artist operator(extensions.%) p_query
           or lp.title ilike '%' || p_query || '%' or lp.artist ilike '%' || p_query || '%')
      and exists (select 1 from public.posts p where p.link_preview_id = lp.id)
    order by score desc, lp.title
    limit least(greatest(p_limit, 1), 50)
  )
  -- Só conta os posts das músicas que vão aparecer.
  select f.id, f.url, f.platform, f.kind, f.title, f.artist, f.image_url,
         (select count(*)::int from public.posts p where p.link_preview_id = f.id and not public.content_hidden(p.author_id))
  from found f
  order by f.score desc, f.title;
$function$;

-- public.profile_posts(uuid,timestamp with time zone,uuid,integer): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.profile_posts(p_author uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.author_id = p_author
    and not public.content_hidden(p.author_id)
    and (
      p_before is null
      or p.created_at < p_before
      or (p_before_id is not null and p.created_at = p_before and p.id < p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

-- public.vibe_media_visible(text): v.author_id (1x)
CREATE OR REPLACE FUNCTION public.vibe_media_visible(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.vibes v
    where v.media_path = p_name
      and private.vibe_active(v.created_at)
      and not public.content_hidden(v.author_id)
  );
$function$;

-- public.vibes_tray(): p.id (1x)
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
  group by p.id
  order by (p.id = auth.uid()) desc,
           bool_or(v.author_id <> auth.uid() and not exists (
             select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()
           )) desc,
           max(v.created_at) desc
  limit 100;
$function$;

-- public.vibe_mark_seen(uuid): v.author_id (1x)
CREATE OR REPLACE FUNCTION public.vibe_mark_seen(p_vibe uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into public.vibe_views (vibe_id, viewer_id)
  select v.id, auth.uid()
  from public.vibes v
  where v.id = p_vibe
    and v.author_id <> auth.uid()
    and private.vibe_active(v.created_at)
    and not public.content_hidden(v.author_id)
  on conflict do nothing;
$function$;

-- public.post_media_visible(text): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.post_media_visible(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.post_media m join public.posts p on p.id = m.post_id
    where m.path = p_name and not public.content_hidden(p.author_id)
  );
$function$;

-- public.post_detail(uuid): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.post_detail(p_post uuid)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.id = p_post
    and not public.content_hidden(p.author_id);
$function$;

-- public.liked_posts(uuid,uuid,integer): p.author_id, p_user (2x)
CREATE OR REPLACE FUNCTION public.liked_posts(p_user uuid, p_after_post uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes ml where ml.post_id = p.id and ml.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type
  from public.likes l
  join public.posts p on p.id = l.post_id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where l.user_id = p_user
    and not public.content_hidden(p_user)
    and not public.content_hidden(p.author_id)
    and (
      p_after_post is null
      or (l.created_at, l.post_id) < (
        select c.created_at, c.post_id from public.likes c where c.user_id = p_user and c.post_id = p_after_post
      )
    )
  order by l.created_at desc, l.post_id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

-- public.post_comments(uuid): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.post_comments(p_post uuid)
 RETURNS TABLE(id uuid, parent_id uuid, body text, created_at timestamp with time zone, like_count integer, reply_count integer, liked_by_me boolean, author_id uuid, author_username text, author_display_name text, author_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    c.id, c.parent_id, c.body, c.created_at, c.like_count, c.reply_count,
    exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url
  from public.comments c
  join public.profiles a on a.id = c.author_id
  join public.posts p on p.id = c.post_id
  left join public.comments root on root.id = c.parent_id
  where c.post_id = p_post
    and not public.content_hidden(p.author_id)
    and not public.is_blocked_with(c.author_id)
    -- Resposta de um comentário escondido (bloqueio) some junto.
    and (root.id is null or not public.is_blocked_with(root.author_id))
  order by coalesce(root.created_at, c.created_at), coalesce(root.id, c.id), c.parent_id nulls first, c.created_at, c.id
  limit 500;
$function$;

-- public.vibe_create(text,text,integer,text,text,uuid,uuid,real,real): v_post_author (1x)
CREATE OR REPLACE FUNCTION public.vibe_create(p_kind text, p_media_path text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_text text DEFAULT NULL::text, p_style text DEFAULT 'violet'::text, p_link_preview_id uuid DEFAULT NULL::uuid, p_post_id uuid DEFAULT NULL::uuid, p_text_x real DEFAULT NULL::real, p_text_y real DEFAULT NULL::real)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := auth.uid();
  v_post_author uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_authenticated';
  end if;

  if p_media_path is not null then
    -- O arquivo tem que ser meu, ter passado pela Edge Function (existir no bucket) e não
    -- estar em outra vibe.
    if split_part(p_media_path, '/', 1) <> v_me::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'vibes' and o.name = p_media_path)
       or exists (select 1 from public.vibes v where v.media_path = p_media_path) then
      raise exception 'invalid_media';
    end if;
  end if;

  if p_post_id is not null then
    select author_id into v_post_author from public.posts where id = p_post_id;
    if v_post_author is null or public.content_hidden(v_post_author) then
      raise exception 'not_found';
    end if;
  end if;

  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;

  -- Limpa as minhas vibes vencidas (a mídia sai na próxima vez que a Edge Function rodar).
  delete from public.vibes where author_id = v_me and not private.vibe_active(created_at);

  insert into public.vibes (author_id, kind, media_path, duration_ms, text, style, link_preview_id, post_id, text_x, text_y)
  values (v_me, p_kind, p_media_path, p_duration_ms, nullif(btrim(p_text), ''), coalesce(p_style, 'violet'), p_link_preview_id, p_post_id,
          -- Posição só faz sentido com texto; sem ela, o app usa o lugar padrão do tipo.
          case when nullif(btrim(p_text), '') is not null then p_text_x end,
          case when nullif(btrim(p_text), '') is not null then p_text_y end)
  returning id into v_id;
  return v_id;
end;
$function$;

-- public.vibes_of(uuid): sp.author_id, v.author_id (2x)
CREATE OR REPLACE FUNCTION public.vibes_of(p_author uuid)
 RETURNS TABLE(id uuid, kind text, media_path text, duration_ms integer, text text, style text, created_at timestamp with time zone, seen boolean, view_count integer, preview_url text, preview_platform text, preview_title text, preview_artist text, preview_image_url text, post_id uuid, post_body text, post_author_username text, post_author_avatar_url text, text_x real, text_y real, preview_audio_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    v.id, v.kind, v.media_path, v.duration_ms, v.text, v.style, v.created_at,
    exists (select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()),
    -- Quantas pessoas viram: só para o autor.
    case when v.author_id = auth.uid() then (select count(*)::int from public.vibe_views w where w.vibe_id = v.id) end,
    coalesce(lp.url, plp.url), coalesce(lp.platform, plp.platform), coalesce(lp.title, plp.title),
    coalesce(lp.artist, plp.artist), coalesce(lp.image_url, plp.image_url),
    v.post_id, left(sp.body, 200), spa.username, spa.avatar_url,
    v.text_x, v.text_y,
    coalesce(lp.audio_url, plp.audio_url)
  from public.vibes v
  left join public.link_previews lp on lp.id = v.link_preview_id
  left join public.posts sp on sp.id = v.post_id
  left join public.profiles spa on spa.id = sp.author_id
  left join public.link_previews plp on plp.id = sp.link_preview_id
  where v.author_id = p_author
    and private.vibe_active(v.created_at)
    and not public.content_hidden(v.author_id)
    -- Post compartilhado de alguém com quem eu tenho bloqueio: não aparece.
    and (sp.author_id is null or not public.content_hidden(sp.author_id))
  order by v.created_at, v.id
  limit 100;
$function$;

-- public.profile_liked_songs(uuid,timestamp with time zone,uuid,integer): p_user (1x)
CREATE OR REPLACE FUNCTION public.profile_liked_songs(p_user uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(link_preview_id uuid, url text, platform text, title text, artist text, album text, image_url text, liked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select lp.id, lp.url, lp.platform, lp.title, lp.artist, lp.album, lp.image_url, s.created_at
  from public.discover_swipes s
  join public.link_previews lp on lp.id = s.link_preview_id
  where auth.uid() is not null
    and s.user_id = p_user
    and s.liked
    and not public.content_hidden(p_user)
    and (p_before is null or (s.created_at, s.link_preview_id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.created_at desc, s.link_preview_id desc
  limit least(greatest(p_limit, 1), 50);
$function$;

-- public.genre_posts(text,timestamp with time zone,uuid,integer): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.genre_posts(p_genre text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and not public.content_hidden(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;

-- public.search_posts(text,timestamp with time zone,uuid,integer): p.author_id (1x)
CREATE OR REPLACE FUNCTION public.search_posts(p_query text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF feed_item
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q text := private.fold(btrim(coalesce(p_query, '')));
  pattern text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Com menos de 3 letras o índice não serve e a busca leria todos os posts.
  if char_length(q) < 3 or char_length(q) > 100 then
    return;
  end if;
  -- % e _ digitados valem como letra, não como curinga.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
  where private.fold(p.body) like pattern escape '\'
    and not public.content_hidden(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;

-- public.reviews_feed(timestamp with time zone,uuid,integer,uuid,uuid): r.author_id (1x)
CREATE OR REPLACE FUNCTION public.reviews_feed(p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_author uuid DEFAULT NULL::uuid, p_album uuid DEFAULT NULL::uuid)
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
  select r.id, r.rating, r.body, r.like_count,
         exists (select 1 from public.review_likes l where l.review_id = r.id and l.user_id = auth.uid()),
         r.created_at,
         a.id, a.username, a.display_name, a.avatar_url,
         lp.id, lp.title, lp.artist, lp.image_url, lp.url, lp.platform,
         extract(year from lp.release_date)::int
  from public.album_reviews r
  join public.profiles a on a.id = r.author_id
  join public.link_previews lp on lp.id = r.album_id
  where (p_author is null or r.author_id = p_author)
    and (p_album is null or r.album_id = p_album)
    and not public.content_hidden(r.author_id)
    and (p_before is null or (r.created_at, r.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, r.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;
