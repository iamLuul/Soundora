-- Notificações: curtidas, comentários, respostas e novos seguidores, com push no celular.
--
-- As linhas são criadas só por triggers (o app não insere nem altera nada direto); o app lê
-- pela função notifications_list e marca como lidas por notifications_mark_read.
-- O push sai pelo serviço da Expo (https://exp.host), via pg_net, só se a pessoa tiver
-- ativado as notificações no celular (token em push_tokens).

-- ---------------------------------------------------------------- tabelas

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade, -- quem recebe
  actor_id uuid not null references public.profiles (id) on delete cascade, -- quem fez
  -- like: curtiu seu post · comment: comentou no seu post
  -- reply: comentou num post em que você também comentou · follow: começou a seguir você
  kind text not null check (kind in ('like', 'comment', 'reply', 'follow')),
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (user_id <> actor_id),
  check ((kind = 'follow') = (post_id is null))
);
create index notifications_user on public.notifications (user_id, id desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
-- Curtir/descurtir ou seguir/deixar de seguir várias vezes não gera notificações repetidas.
create unique index notifications_like_once on public.notifications (user_id, actor_id, post_id) where kind = 'like';
create unique index notifications_follow_once on public.notifications (user_id, actor_id) where kind = 'follow';
-- Uma notificação de resposta não lida por post (a mais recente substitui a anterior).
create unique index notifications_reply_unread on public.notifications (user_id, post_id) where kind = 'reply' and read_at is null;

alter table public.notifications enable row level security;
-- Sem policies e sem grants: o app só chega aqui pelas funções abaixo.

-- Aparelhos com push ativado. O token é da Expo (ExponentPushToken[...]).
create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

-- Fechadas de vez para o app (além do RLS sem policies): só as funções abaixo mexem nelas.
revoke all on public.notifications, public.push_tokens from anon, authenticated;

-- ---------------------------------------------------------------- criação (triggers)

-- true se um dos dois bloqueou o outro.
create function private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke execute on function private.blocked_between(uuid, uuid) from public;

create function private.tg_notify_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
begin
  if tg_op = 'DELETE' then
    -- Descurtiu: a notificação some (não fica "fulano curtiu" de algo que já não vale).
    delete from public.notifications
    where kind = 'like' and actor_id = old.user_id and post_id = old.post_id;
    return old;
  end if;
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is null or v_author = new.user_id or private.blocked_between(v_author, new.user_id) then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, kind, post_id)
  values (v_author, new.user_id, 'like', new.post_id)
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.tg_notify_like() from public;
create trigger notify after insert or delete on public.likes
  for each row execute function private.tg_notify_like();

create function private.tg_notify_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where kind = 'follow' and actor_id = old.follower_id and user_id = old.followee_id;
    return old;
  end if;
  if private.blocked_between(new.followee_id, new.follower_id) then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, kind)
  values (new.followee_id, new.follower_id, 'follow')
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.tg_notify_follow() from public;
create trigger notify after insert or delete on public.follows
  for each row execute function private.tg_notify_follow();

create function private.tg_notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_others uuid[];
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is null then
    return new;
  end if;

  -- Dono do post.
  if v_author <> new.author_id and not private.blocked_between(v_author, new.author_id) then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (v_author, new.author_id, 'comment', new.post_id, new.id);
  end if;

  -- Quem também comentou nesse post (até 50 pessoas, as mais recentes).
  -- A resposta não lida anterior do mesmo post é trocada por esta, para não lotar a lista.
  select coalesce(array_agg(x.author_id), '{}') into v_others
  from (
    select c.author_id
    from public.comments c
    where c.post_id = new.post_id
      and c.author_id <> new.author_id
      and c.author_id <> v_author
      and c.id <> new.id
    group by c.author_id
    order by max(c.created_at) desc
    limit 50
  ) x
  where not private.blocked_between(x.author_id, new.author_id);

  if cardinality(v_others) > 0 then
    delete from public.notifications
    where kind = 'reply' and read_at is null and post_id = new.post_id and user_id = any (v_others);
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    select u, new.author_id, 'reply', new.post_id, new.id from unnest(v_others) u;
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_notify_comment() from public;
create trigger notify after insert on public.comments
  for each row execute function private.tg_notify_comment();

-- ---------------------------------------------------------------- push (Expo, via pg_net)

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- Texto do push no idioma de quem recebe. Nunca inclui e-mail nem dados privados:
-- só o @ de quem fez a ação e, no comentário, o começo do texto (que já é público no post).
create function private.push_text(p_kind text, p_locale text, p_username text, p_comment text)
returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_locale = 'en' then case p_kind
      when 'like' then jsonb_build_object('title', 'New like', 'body', '@' || p_username || ' liked your post')
      when 'comment' then jsonb_build_object('title', '@' || p_username || ' commented', 'body', left(coalesce(p_comment, ''), 120))
      when 'reply' then jsonb_build_object('title', '@' || p_username || ' also commented', 'body', left(coalesce(p_comment, ''), 120))
      else jsonb_build_object('title', 'New follower', 'body', '@' || p_username || ' started following you')
    end
    else case p_kind
      when 'like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu post')
      when 'comment' then jsonb_build_object('title', '@' || p_username || ' comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'reply' then jsonb_build_object('title', '@' || p_username || ' também comentou', 'body', left(coalesce(p_comment, ''), 120))
      else jsonb_build_object('title', 'Novo seguidor', 'body', '@' || p_username || ' começou a seguir você')
    end
  end;
$$;
revoke execute on function private.push_text(text, text, text, text) from public;

create function private.tg_push_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_locale text;
  v_username text;
  v_comment text;
  v_text jsonb;
  v_messages jsonb;
begin
  -- Sem pg_net (ex.: testes sem Supabase) ou sem aparelho cadastrado: nada a enviar.
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return new;
  end if;
  if not exists (select 1 from public.push_tokens where user_id = new.user_id) then
    return new;
  end if;
  -- No máximo 30 pushes por hora para cada pessoa (o resto fica só na lista do app).
  if not private.hit(new.user_id, 'push', 30, interval '1 hour') then
    return new;
  end if;

  select locale into v_locale from public.profiles where id = new.user_id;
  select username into v_username from public.profiles where id = new.actor_id;
  if new.comment_id is not null then
    select body into v_comment from public.comments where id = new.comment_id;
  end if;
  v_text := private.push_text(new.kind, v_locale, v_username, v_comment);

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', v_text ->> 'title',
    'body', v_text ->> 'body',
    'sound', 'default',
    'data', jsonb_build_object('url', '/notifications')
  ))
  into v_messages
  from public.push_tokens t
  where t.user_id = new.user_id;

  -- Assíncrono: o pg_net envia depois do commit, sem atrasar a curtida/comentário.
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
  using 'https://exp.host/--/api/v2/push/send', v_messages,
        jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json');
  return new;
exception when others then
  -- Push é extra: um erro aqui nunca impede a curtida, o comentário ou o seguir.
  return new;
end;
$$;
revoke execute on function private.tg_push_notification() from public;
create trigger push after insert on public.notifications
  for each row execute function private.tg_push_notification();

-- ---------------------------------------------------------------- leitura pelo app

-- p_filter: 'all' ou 'replies' (comentários no seu post + respostas). Paginação por id.
create function public.notifications_list(p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (
  id bigint,
  kind text,
  created_at timestamptz,
  read boolean,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
  post_id uuid,
  preview_title text,
  preview_image_url text,
  comment_body text
)
language sql stable security definer set search_path = '' as $$
  select
    n.id, n.kind, n.created_at, n.read_at is not null,
    a.id, a.username, a.display_name, a.avatar_url,
    n.post_id, lp.title, lp.image_url,
    left(c.body, 140)
  from public.notifications n
  join public.profiles a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  left join public.comments c on c.id = n.comment_id
  where n.user_id = auth.uid()
    and (p_filter <> 'replies' or n.kind in ('comment', 'reply'))
    and (p_before is null or n.id < p_before)
    and not public.is_blocked_with(n.actor_id)
  order by n.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.notifications_unread_count()
returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select 1 from public.notifications n
    where n.user_id = auth.uid() and n.read_at is null and not public.is_blocked_with(n.actor_id)
    limit 100
  ) x;
$$;

create function public.notifications_mark_read()
returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

-- O app cadastra o token deste aparelho. Se o aparelho era de outra conta, passa para esta.
create function public.push_token_register(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if (select count(*) from public.push_tokens where user_id = auth.uid() and token <> p_token) >= 10 then
    -- Até 10 aparelhos por conta: some o mais antigo.
    delete from public.push_tokens where token = (
      select token from public.push_tokens where user_id = auth.uid() order by updated_at limit 1
    );
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create function public.push_token_unregister(p_token text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

grant execute on function
  public.notifications_list(text, bigint, int),
  public.notifications_unread_count(),
  public.notifications_mark_read(),
  public.push_token_register(text, text),
  public.push_token_unregister(text)
to authenticated;

create trigger rate_limit before insert or update on public.push_tokens
  for each row execute function private.tg_rate_limit('push_token', '30', '1 hour');
