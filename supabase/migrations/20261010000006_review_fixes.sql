-- Correções da revisão de código.
--   1. Login por @: limite atômico (pedidos simultâneos não furam), por IP e por dia; limpeza automática.
--   2. Feed com instante fixo por rolagem (não repete nem pula posts entre páginas).
--   3. Posts do perfil paginados por (created_at, id), sem perder empates.
--   4. Buscas com search_path vazio, como as outras funções com privilégio de dono.

-- ---------------------------------------------------------------- 1. login por @

alter table public.login_attempts add column ip text;
create index login_attempts_ip on public.login_attempts (ip, created_at desc) where ip is not null;
create index login_attempts_created on public.login_attempts (created_at);

drop function public.login_attempts_recent(text, text, int, boolean);

-- Reserva uma tentativa antes de falar com o Supabase Auth. Devolve o id da tentativa, ou
-- null se passou de algum limite. A tentativa nasce como falha e só vira sucesso em
-- login_attempt_finish: assim 50 pedidos simultâneos contam como 50, e não como 0.
--
-- Limites por @:  senha e código errados: 5 a cada 15 min (cada um)
--                 envio de código: 3 a cada 10 min e 6 por dia (contra encher a caixa de alguém)
-- Limites por IP: 20 falhas a cada 15 min, somando todos os @ (contra testar uma senha em muitos @)
--                 10 envios de código por hora
create function public.login_attempt_start(p_username text, p_kind text, p_ip text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_user text := lower(trim(p_username));
  v_ip text := nullif(left(trim(coalesce(p_ip, '')), 64), '');
  v_id bigint;
begin
  if p_kind not in ('password', 'send_code', 'verify_code') then
    raise exception 'invalid_kind';
  end if;

  -- Um pedido de cada vez por @ e tipo, e por IP (sempre nesta ordem, para não travar).
  perform pg_advisory_xact_lock(hashtext('login:' || v_user || ':' || p_kind));
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtext('login-ip:' || v_ip));
  end if;

  -- Tentativas com mais de 2 dias já não contam para nenhum limite.
  delete from public.login_attempts where created_at < now() - interval '2 days';

  if p_kind = 'send_code' then
    if (select count(*) from public.login_attempts
        where username = v_user and kind = 'send_code' and created_at > now() - interval '10 minutes') >= 3
      or (select count(*) from public.login_attempts
          where username = v_user and kind = 'send_code' and created_at > now() - interval '1 day') >= 6 then
      return null;
    end if;
  elsif (select count(*) from public.login_attempts
         where username = v_user and kind = p_kind and not success and created_at > now() - interval '15 minutes') >= 5 then
    return null;
  end if;

  if v_ip is not null then
    if (select count(*) from public.login_attempts
        where ip = v_ip and not success and kind <> 'send_code' and created_at > now() - interval '15 minutes') >= 20 then
      return null;
    end if;
    if p_kind = 'send_code' and (select count(*) from public.login_attempts
        where ip = v_ip and kind = 'send_code' and created_at > now() - interval '1 hour') >= 10 then
      return null;
    end if;
  end if;

  insert into public.login_attempts (username, kind, success, ip)
  values (v_user, p_kind, false, v_ip)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.login_attempt_finish(p_id bigint, p_success boolean)
returns void
language sql security definer set search_path = '' as $$
  update public.login_attempts set success = p_success where id = p_id;
$$;

grant execute on function public.login_attempt_start(text, text, text), public.login_attempt_finish(bigint, boolean) to service_role;

-- ---------------------------------------------------------------- 2. feed

-- p_now: o instante em que a pessoa abriu o feed. As páginas seguintes usam o mesmo
-- instante, então a ordem não muda no meio da rolagem e posts novos não empurram os antigos.
drop function public.feed_for_you(int, int);
create function public.feed_for_you(p_limit int default 20, p_offset int default 0, p_now timestamptz default null)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
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
    ) / power(extract(epoch from ((select at from me) - p.created_at)) / 3600.0 + 2, 1.3) as score
  from public.posts p
  join public.profiles a on a.id = p.author_id
  join public.link_previews lp on lp.id = p.link_preview_id
  where p.created_at > (select at from me) - interval '14 days'
    and p.created_at <= (select at from me)
    and not public.is_blocked_with(p.author_id)
  order by score desc, p.created_at desc, p.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;
grant execute on function public.feed_for_you(int, int, timestamptz) to authenticated;

-- ---------------------------------------------------------------- 3. posts do perfil

-- Cursor (created_at, id): dois posts com o mesmo horário na virada da página não somem.
drop function public.profile_posts(uuid, timestamptz, int);
create function public.profile_posts(p_author uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
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
    and (
      p_before is null
      or p.created_at < p_before
      or (p_before_id is not null and p.created_at = p_before and p.id < p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.profile_posts(uuid, timestamptz, uuid, int) to authenticated;

-- ---------------------------------------------------------------- 4. buscas com search_path vazio

create or replace function public.search_profiles(p_query text, p_limit int default 20)
returns setof public.profiles
language sql stable security definer set search_path = '' as $$
  select pr.*
  from public.profiles pr
  where char_length(trim(p_query)) >= 2
    and (pr.username operator(extensions.%) lower(p_query) or pr.display_name operator(extensions.%) p_query
         or pr.username ilike lower(p_query) || '%' or pr.display_name ilike '%' || p_query || '%')
    and not public.is_blocked_with(pr.id)
  order by greatest(extensions.similarity(pr.username, lower(p_query)), extensions.similarity(pr.display_name, p_query)) desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.search_tracks(p_query text, p_limit int default 20)
returns table (
  link_preview_id uuid,
  url text,
  platform text,
  kind text,
  title text,
  artist text,
  image_url text,
  post_count int
)
language sql stable security definer set search_path = '' as $$
  select lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
         (select count(*)::int from public.posts p where p.link_preview_id = lp.id and not public.is_blocked_with(p.author_id))
  from public.link_previews lp
  where char_length(trim(p_query)) >= 2
    and exists (select 1 from public.posts p where p.link_preview_id = lp.id)
    and (lp.title operator(extensions.%) p_query or coalesce(lp.artist, '') operator(extensions.%) p_query
         or lp.title ilike '%' || p_query || '%' or lp.artist ilike '%' || p_query || '%')
  order by greatest(extensions.similarity(lp.title, p_query), extensions.similarity(coalesce(lp.artist, ''), p_query)) desc, lp.title
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------- 5. limite de ações em DELETE

-- Num trigger BEFORE DELETE, NEW é nulo e devolver nulo CANCELA a remoção. O trigger de
-- limite em user_genres (insert or delete) impedia remover gêneros e deixava sobras ao
-- excluir uma conta. Agora devolve OLD no DELETE.
create or replace function private.tg_rate_limit()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result record := case when tg_op = 'DELETE' then old else new end;
begin
  -- Sem pessoa logada = servidor (chave secreta) ou manutenção: sem limite.
  if uid is null then
    return result;
  end if;
  if not private.hit(uid, tg_argv[0], tg_argv[1]::int, tg_argv[2]::interval) then
    raise exception 'rate_limited' using hint = tg_argv[0];
  end if;
  return result;
end;
$$;
revoke execute on function private.tg_rate_limit() from public;

-- Sobras de contas já excluídas.
delete from public.user_genres g where not exists (select 1 from public.profiles p where p.id = g.user_id);
