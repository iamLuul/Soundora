-- Mensagens diretas (DM): conversas de duas pessoas, com pedidos e resposta de vibe.
--
-- Quem pode mandar: qualquer pessoa, menos quem tem bloqueio com você. Se você não segue quem
-- mandou, a conversa chega em "Pedidos": a pessoa só fica sabendo que você leu (e recebe push)
-- depois que você aceitar ou responder. Recusar = apagar a conversa da sua lista.
--
-- Segurança:
-- - As três tabelas ficam fechadas para o app (RLS sem policies e sem grants). Tudo passa pelas
--   funções abaixo, que conferem o login e se a pessoa é da conversa.
-- - O push diz só quem mandou ("@fulano enviou uma mensagem"), nunca o texto: a mensagem não
--   passa pelo serviço de push nem aparece na tela bloqueada.
-- - O aviso ao vivo (Realtime) leva só o id da conversa, no canal privado de cada pessoa.
-- - Conta suspensa não manda mensagem; limites por pessoa contra spam.
-- - Responder vibe: só uma vibe ativa, de quem vai receber, que eu posso ver.

-- ---------------------------------------------------------------- tabelas

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- As duas pessoas, em ordem (uma conversa só por par).
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- false: a conversa está nos Pedidos dessa pessoa.
  accepted boolean not null,
  -- Até onde a pessoa leu (o outro vê "Visto").
  last_read_at timestamptz,
  -- "Apagar conversa" (só para mim): as mensagens até aqui somem da minha tela.
  cleared_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user on public.conversation_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text check (body is null or char_length(body) between 1 and 1000),
  -- Resposta de vibe: a vibe (some quando ela vence ou é apagada) e a marca de que era resposta.
  vibe_id uuid references public.vibes (id) on delete set null,
  vibe_reply boolean not null default false,
  -- Curtida de quem recebeu.
  liked boolean not null default false,
  -- Desfeita por quem mandou: o texto sai do banco.
  unsent_at timestamptz,
  created_at timestamptz not null default now(),
  -- Toda mensagem tem texto (a resposta de vibe também), menos a desfeita.
  check (unsent_at is not null or body is not null)
);
create index messages_conversation on public.messages (conversation_id, id desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.conversation_members, public.messages from anon, authenticated;

-- Conta suspensa não manda mensagem.
create trigger block_suspended before insert on public.messages
  for each row execute function private.tg_block_suspended('sender_id');

-- ---------------------------------------------------------------- avisos (ao vivo e push)

-- Push de mensagem pode ser desligado em Configurações › Notificações.
alter table public.notification_settings drop constraint if exists notification_settings_muted_kinds_check;
alter table public.notification_settings add constraint notification_settings_muted_kinds_check check (muted_kinds <@ array[
  'like', 'comment', 'reply', 'follow', 'comment_reply', 'comment_like', 'review_like', 'follow_request', 'follow_accepted', 'message']::text[]);

-- Aviso ao vivo para uma pessoa: só o id da conversa (o app busca o resto pelas funções).
create function private.dm_live(p_user uuid, p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('conversation_id', p_conversation), 'dm', 'user:' || p_user::text, true);
exception when others then
  null; -- extra: nunca impede a mensagem
end;
$$;
revoke execute on function private.dm_live(uuid, uuid) from public;

-- Push de mensagem nova: só quem mandou, nunca o texto. Pedidos não geram push.
create function private.dm_push(p_to uuid, p_from uuid, p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_locale text;
  v_username text;
  v_messages jsonb;
begin
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    return;
  end if;
  if not exists (select 1 from public.push_tokens where user_id = p_to) then
    return;
  end if;
  if exists (select 1 from public.notification_settings s where s.user_id = p_to and 'message' = any (s.muted_kinds)) then
    return;
  end if;
  -- Até 30 pushes de mensagem por hora para cada pessoa.
  if not private.hit(p_to, 'push_dm', 30, interval '1 hour') then
    return;
  end if;
  select locale into v_locale from public.profiles where id = p_to;
  select username into v_username from public.profiles where id = p_from;
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '@' || v_username,
    'body', case when v_locale = 'en' then 'sent you a message' else 'enviou uma mensagem' end,
    'sound', 'default',
    'data', jsonb_build_object('url', '/messages/' || p_conversation::text)
  ))
  into v_messages
  from public.push_tokens t
  where t.user_id = p_to;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
  using 'https://exp.host/--/api/v2/push/send', v_messages,
        jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json');
exception when others then
  null;
end;
$$;
revoke execute on function private.dm_push(uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------- ajudantes

-- A outra pessoa da conversa, se eu sou da conversa (null se não sou).
create function private.dm_other(p_conversation uuid, p_me uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when c.user_a = p_me then c.user_b when c.user_b = p_me then c.user_a end
  from public.conversations c
  where c.id = p_conversation;
$$;
revoke execute on function private.dm_other(uuid, uuid) from public;

create function private.require_login() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return auth.uid();
end;
$$;
revoke execute on function private.require_login() from public;

-- ---------------------------------------------------------------- enviar

-- Manda uma mensagem para alguém (p_to) ou numa conversa (p_conversation). Cria a conversa na
-- primeira mensagem. p_vibe: responder a uma vibe de quem vai receber.
create function public.dm_send(p_body text, p_to uuid default null, p_conversation uuid default null, p_vibe uuid default null)
returns table (conversation_id uuid, message_id bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me uuid := private.require_login();
  v_to uuid := p_to;
  v_conv uuid := p_conversation;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_new boolean := false;
  v_accepted_by_them boolean;
  v_id bigint;
begin
  if v_body is null or char_length(v_body) > 1000 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  if v_conv is not null then
    v_to := private.dm_other(v_conv, v_me);
    if v_to is null then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  elsif v_to is null or v_to = v_me then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_to) or private.blocked_between(v_me, v_to) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Resposta de vibe: ativa, de quem vai receber, e que eu posso ver.
  if p_vibe is not null and not exists (
    select 1 from public.vibes v
    where v.id = p_vibe and v.author_id = v_to and private.vibe_active(v.created_at) and not public.content_hidden(v.author_id)
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Limites contra spam: mensagens e conversas novas.
  if not private.hit(v_me, 'dm', 60, interval '10 minutes') then
    raise exception 'rate_limited' using errcode = 'P0001', detail = coalesce(private.retry_after(v_me, 'dm', interval '10 minutes'), 60)::text;
  end if;

  if v_conv is null then
    select c.id into v_conv from public.conversations c where c.user_a = least(v_me, v_to) and c.user_b = greatest(v_me, v_to);
  end if;
  if v_conv is null then
    if not private.hit(v_me, 'dm_new', 30, interval '1 day') then
      raise exception 'rate_limited' using errcode = 'P0001', detail = coalesce(private.retry_after(v_me, 'dm_new', interval '1 day'), 3600)::text;
    end if;
    insert into public.conversations (user_a, user_b) values (least(v_me, v_to), greatest(v_me, v_to))
    on conflict (user_a, user_b) do nothing
    returning id into v_conv;
    if v_conv is null then
      select c.id into v_conv from public.conversations c where c.user_a = least(v_me, v_to) and c.user_b = greatest(v_me, v_to);
    else
      v_new := true;
    end if;
  end if;

  -- Quem recebe aceita na hora se segue quem mandou; senão, a conversa vai para os Pedidos.
  insert into public.conversation_members (conversation_id, user_id, accepted)
  values (v_conv, v_to, exists (select 1 from public.follows f where f.follower_id = v_to and f.followee_id = v_me))
  on conflict do nothing;
  -- Quem manda sempre aceita (responder um pedido é aceitar).
  insert into public.conversation_members (conversation_id, user_id, accepted, last_read_at)
  values (v_conv, v_me, true, now())
  on conflict (conversation_id, user_id) do update set accepted = true, last_read_at = now();

  insert into public.messages (conversation_id, sender_id, body, vibe_id, vibe_reply)
  values (v_conv, v_me, v_body, p_vibe, p_vibe is not null)
  returning id into v_id;
  update public.conversations set last_message_at = now() where id = v_conv;

  select m.accepted into v_accepted_by_them from public.conversation_members m where m.conversation_id = v_conv and m.user_id = v_to;
  perform private.dm_live(v_to, v_conv);
  if v_accepted_by_them then
    perform private.dm_push(v_to, v_me, v_conv);
  end if;

  return query select v_conv, v_id;
end;
$$;

-- ---------------------------------------------------------------- listas

-- Minhas conversas (p_requests = false) ou os pedidos (true), da mais recente para a mais antiga.
create function public.dm_inbox(p_requests boolean default false, p_before timestamptz default null, p_limit int default 30)
returns table (
  conversation_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_body text,
  last_from_me boolean,
  last_vibe_reply boolean,
  last_unsent boolean,
  last_at timestamptz,
  unread boolean
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, o.id, o.username, o.display_name, o.avatar_url,
    left(lm.body, 120), lm.sender_id = me.user_id, lm.vibe_reply, lm.unsent_at is not null,
    lm.created_at,
    lm.sender_id <> me.user_id and (me.last_read_at is null or lm.created_at > me.last_read_at)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.profiles o on o.id = case when c.user_a = me.user_id then c.user_b else c.user_a end
  cross join lateral (
    select m.body, m.sender_id, m.vibe_reply, m.unsent_at, m.created_at
    from public.messages m
    where m.conversation_id = c.id and (me.cleared_at is null or m.created_at > me.cleared_at)
    order by m.id desc
    limit 1
  ) lm
  where me.user_id = auth.uid()
    and me.accepted = not coalesce(p_requests, false)
    and not public.is_blocked_with(o.id)
    and (p_before is null or lm.created_at < p_before)
  order by lm.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Bolinha do ícone de mensagens: conversas com mensagem nova e pedidos novos.
create function public.dm_unread_count()
returns table (unread int, requests int)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select me.accepted, exists (
      select 1 from public.messages m
      where m.conversation_id = me.conversation_id
        and m.sender_id <> me.user_id
        and (me.last_read_at is null or m.created_at > me.last_read_at)
        and (me.cleared_at is null or m.created_at > me.cleared_at)
    ) as has_new
    from public.conversation_members me
    join public.conversations c on c.id = me.conversation_id
    where me.user_id = auth.uid()
      and not public.is_blocked_with(case when c.user_a = me.user_id then c.user_b else c.user_a end)
  )
  select
    (count(*) filter (where accepted and has_new))::int,
    (count(*) filter (where not accepted and has_new))::int
  from mine;
$$;

-- Conversa com alguém (para abrir pelo perfil): o id, se já existe.
create function public.dm_find(p_user uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.conversations c
  join public.conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  where c.user_a = least(auth.uid(), p_user) and c.user_b = greatest(auth.uid(), p_user)
    and not public.is_blocked_with(p_user);
$$;

-- Cabeçalho da conversa: quem é a outra pessoa, se está nos meus pedidos e até onde ela leu.
create function public.dm_conversation(p_conversation uuid)
returns table (
  conversation_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accepted boolean,
  their_last_read_at timestamptz,
  can_send boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, o.id, o.username, o.display_name, o.avatar_url, me.accepted,
    -- "Visto" só depois que a outra pessoa aceitou a conversa.
    case when them.accepted then them.last_read_at end,
    not private.blocked_between(auth.uid(), o.id)
  from public.conversations c
  join public.conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  join public.profiles o on o.id = case when c.user_a = me.user_id then c.user_b else c.user_a end
  left join public.conversation_members them on them.conversation_id = c.id and them.user_id = o.id
  where c.id = p_conversation
    and not public.is_blocked_with(o.id);
$$;

-- Mensagens de uma conversa (só de quem é da conversa), da mais nova para a mais antiga.
create function public.dm_messages(p_conversation uuid, p_before bigint default null, p_limit int default 40)
returns table (
  id bigint,
  from_me boolean,
  body text,
  liked boolean,
  unsent boolean,
  created_at timestamptz,
  vibe_reply boolean,
  vibe_id uuid,
  vibe_kind text,
  vibe_media_path text,
  vibe_text text,
  vibe_style text,
  vibe_mine boolean
)
language sql stable security definer set search_path = '' as $$
  select
    m.id, m.sender_id = auth.uid(), case when m.unsent_at is null then m.body end, m.liked, m.unsent_at is not null, m.created_at,
    m.vibe_reply,
    v.id, v.kind, v.media_path, left(v.text, 200), v.style, v.author_id = auth.uid()
  from public.messages m
  join public.conversation_members me on me.conversation_id = m.conversation_id and me.user_id = auth.uid()
  -- A vibe só aparece enquanto está ativa e visível para mim.
  left join public.vibes v on v.id = m.vibe_id and m.unsent_at is null and private.vibe_active(v.created_at) and not public.content_hidden(v.author_id)
  where m.conversation_id = p_conversation
    and (me.cleared_at is null or m.created_at > me.cleared_at)
    and (p_before is null or m.id < p_before)
    and not public.is_blocked_with(private.dm_other(p_conversation, auth.uid()))
  order by m.id desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------- ações

-- Li a conversa (o outro vê "Visto", se eu já aceitei).
create function public.dm_mark_read(p_conversation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_login();
  v_other uuid := private.dm_other(p_conversation, v_me);
  v_accepted boolean;
begin
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = v_me
  returning accepted into v_accepted;
  if v_accepted then
    perform private.dm_live(v_other, p_conversation);
  end if;
end;
$$;

-- Aceitar um pedido: a conversa sai dos Pedidos.
create function public.dm_accept(p_conversation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_login();
begin
  update public.conversation_members set accepted = true, last_read_at = now()
  where conversation_id = p_conversation and user_id = v_me;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.dm_live(private.dm_other(p_conversation, v_me), p_conversation);
end;
$$;

-- Apagar a conversa só para mim (recusar um pedido também é isso). Mensagens novas fazem ela
-- voltar; um pedido apagado volta como pedido.
create function public.dm_delete(p_conversation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_login();
begin
  update public.conversation_members set cleared_at = now(), last_read_at = now()
  where conversation_id = p_conversation and user_id = v_me;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- Curtir (ou descurtir) uma mensagem que eu recebi.
create function public.dm_like(p_message bigint, p_liked boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_login();
  v_conv uuid;
  v_sender uuid;
begin
  select m.conversation_id, m.sender_id into v_conv, v_sender
  from public.messages m
  join public.conversation_members me on me.conversation_id = m.conversation_id and me.user_id = v_me
  where m.id = p_message and m.unsent_at is null;
  if v_conv is null or v_sender = v_me or private.blocked_between(v_me, v_sender) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not private.hit(v_me, 'dm_like', 300, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0001', detail = coalesce(private.retry_after(v_me, 'dm_like', interval '1 hour'), 60)::text;
  end if;
  update public.messages set liked = coalesce(p_liked, false) where id = p_message;
  perform private.dm_live(v_sender, v_conv);
end;
$$;

-- Desfazer o envio (só quem mandou): o texto sai do banco para os dois.
create function public.dm_unsend(p_message bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_login();
  v_conv uuid;
begin
  update public.messages set unsent_at = now(), body = null, vibe_id = null, liked = false
  where id = p_message and sender_id = v_me and unsent_at is null
  returning conversation_id into v_conv;
  if v_conv is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.dm_live(private.dm_other(v_conv, v_me), v_conv);
end;
$$;

-- ---------------------------------------------------------------- permissões

revoke execute on function
  public.dm_send(text, uuid, uuid, uuid),
  public.dm_inbox(boolean, timestamptz, int),
  public.dm_unread_count(),
  public.dm_find(uuid),
  public.dm_conversation(uuid),
  public.dm_messages(uuid, bigint, int),
  public.dm_mark_read(uuid),
  public.dm_accept(uuid),
  public.dm_delete(uuid),
  public.dm_like(bigint, boolean),
  public.dm_unsend(bigint)
from public, anon;
grant execute on function
  public.dm_send(text, uuid, uuid, uuid),
  public.dm_inbox(boolean, timestamptz, int),
  public.dm_unread_count(),
  public.dm_find(uuid),
  public.dm_conversation(uuid),
  public.dm_messages(uuid, bigint, int),
  public.dm_mark_read(uuid),
  public.dm_accept(uuid),
  public.dm_delete(uuid),
  public.dm_like(bigint, boolean),
  public.dm_unsend(bigint)
to authenticated;
