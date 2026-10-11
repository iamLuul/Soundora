-- Respostas a comentários e curtidas em comentários. Gênero só em post com música.
--
-- Respostas têm um nível só (como no Instagram): responder a uma resposta pendura no mesmo
-- comentário principal, e o app começa o texto com o @ de quem está sendo respondido.

-- ---------------------------------------------------------------- respostas

alter table public.comments add column parent_id uuid references public.comments (id) on delete cascade;
alter table public.comments add column like_count int not null default 0;
alter table public.comments add column reply_count int not null default 0;
create index comments_parent on public.comments (parent_id, created_at) where parent_id is not null;

-- A resposta tem que ser do mesmo post e apontar para um comentário principal.
create function private.tg_comment_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select post_id, parent_id into v_parent from public.comments where id = new.parent_id;
  if v_parent.post_id is null or v_parent.post_id <> new.post_id then
    raise exception 'invalid_parent';
  end if;
  -- Resposta de uma resposta: sobe para o comentário principal.
  if v_parent.parent_id is not null then
    new.parent_id := v_parent.parent_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_comment_parent() from public;
create trigger parent before insert on public.comments
  for each row execute function private.tg_comment_parent();

create function private.tg_comment_reply_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update public.comments set reply_count = reply_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update public.comments set reply_count = greatest(reply_count - 1, 0) where id = old.parent_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.tg_comment_reply_count() from public;
create trigger reply_count after insert or delete on public.comments
  for each row execute function private.tg_comment_reply_count();

-- O app só escreve estas colunas (contadores são do servidor).
revoke insert on public.comments from anon, authenticated;
grant insert (post_id, author_id, body, parent_id) on public.comments to authenticated;
revoke update on public.comments from anon, authenticated;

-- ---------------------------------------------------------------- curtidas em comentários

create table public.comment_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index comment_likes_comment on public.comment_likes (comment_id);
alter table public.comment_likes enable row level security;
revoke all on public.comment_likes from anon, authenticated;
grant select, delete on public.comment_likes to authenticated;
grant insert (user_id, comment_id) on public.comment_likes to authenticated;

create policy "curtidas de comentários visíveis" on public.comment_likes for select to authenticated
  using (not public.is_blocked_with(user_id));
create policy "curtir comentário" on public.comment_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.comments c join public.posts p on p.id = c.post_id
      where c.id = comment_id and not public.is_blocked_with(c.author_id) and not public.is_blocked_with(p.author_id)
    )
  );
create policy "descurtir comentário" on public.comment_likes for delete to authenticated
  using (user_id = auth.uid());

create trigger rate_limit before insert on public.comment_likes
  for each row execute function private.tg_rate_limit('comment_like', '300', '1 hour');

create function private.tg_comment_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.tg_comment_like_count() from public;
create trigger like_count after insert or delete on public.comment_likes
  for each row execute function private.tg_comment_like_count();

-- ---------------------------------------------------------------- notificações

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'reply', 'follow', 'comment_reply', 'comment_like'));
-- Curtir/descurtir o mesmo comentário várias vezes avisa uma vez só.
create unique index notifications_comment_like_once on public.notifications (user_id, actor_id, comment_id) where kind = 'comment_like';

create function private.tg_notify_comment_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_post uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where kind = 'comment_like' and actor_id = old.user_id and comment_id = old.comment_id;
    return old;
  end if;
  select author_id, post_id into v_author, v_post from public.comments where id = new.comment_id;
  if v_author is null or v_author = new.user_id or private.blocked_between(v_author, new.user_id) then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
  values (v_author, new.user_id, 'comment_like', v_post, new.comment_id)
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.tg_notify_comment_like() from public;
create trigger notify after insert or delete on public.comment_likes
  for each row execute function private.tg_notify_comment_like();

-- Comentário novo: avisa o dono do post, quem foi respondido e quem também comentou.
-- Cada pessoa recebe um aviso só por comentário (a resposta direta vale mais que o "também comentou").
create or replace function private.tg_notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
  v_replied uuid;
  v_others uuid[];
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is null then
    return new;
  end if;

  -- Quem foi respondido (o @ no começo do texto, se for alguém da conversa; senão, o autor
  -- do comentário principal).
  if new.parent_id is not null then
    select c.author_id into v_replied
    from public.comments c join public.profiles pr on pr.id = c.author_id
    where (c.id = new.parent_id or c.parent_id = new.parent_id)
      and new.body ~* ('^@' || pr.username || '(\s|$)')
    order by c.created_at desc
    limit 1;
    if v_replied is null then
      select author_id into v_replied from public.comments where id = new.parent_id;
    end if;
    if v_replied = new.author_id or private.blocked_between(v_replied, new.author_id) then
      v_replied := null;
    end if;
  end if;

  if v_replied is not null then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (v_replied, new.author_id, 'comment_reply', new.post_id, new.id);
  end if;

  -- Dono do post (se não acabou de receber a resposta direta).
  if v_author <> new.author_id and v_author is distinct from v_replied and not private.blocked_between(v_author, new.author_id) then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (v_author, new.author_id, 'comment', new.post_id, new.id);
  end if;

  -- Quem também comentou (até 50 pessoas, as mais recentes); a não lida anterior é trocada.
  select coalesce(array_agg(x.author_id), '{}') into v_others
  from (
    select c.author_id
    from public.comments c
    where c.post_id = new.post_id
      and c.author_id <> new.author_id
      and c.author_id <> v_author
      and c.author_id is distinct from v_replied
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
      else jsonb_build_object('title', 'New follower', 'body', '@' || p_username || ' started following you')
    end
    else case p_kind
      when 'like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu post')
      when 'comment' then jsonb_build_object('title', '@' || p_username || ' comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'reply' then jsonb_build_object('title', '@' || p_username || ' também comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_reply' then jsonb_build_object('title', '@' || p_username || ' respondeu você', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu comentário')
      else jsonb_build_object('title', 'Novo seguidor', 'body', '@' || p_username || ' começou a seguir você')
    end
  end;
$$;

create or replace function public.notifications_list(p_filter text default 'all', p_before bigint default null, p_limit int default 30)
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
    and (p_filter <> 'replies' or n.kind in ('comment', 'reply', 'comment_reply'))
    and (p_before is null or n.id < p_before)
    and not public.is_blocked_with(n.actor_id)
  order by n.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------- comentários de um post

-- Principais do mais antigo para o mais novo, cada um seguido das suas respostas.
create function public.post_comments(p_post uuid)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  like_count int,
  reply_count int,
  liked_by_me boolean,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.parent_id, c.body, c.created_at, c.like_count, c.reply_count,
    exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url
  from public.comments c
  join public.profiles a on a.id = c.author_id
  join public.posts p on p.id = c.post_id
  left join public.comments root on root.id = c.parent_id
  where c.post_id = p_post
    and not public.is_blocked_with(p.author_id)
    and not public.is_blocked_with(c.author_id)
    -- Resposta de um comentário escondido (bloqueio) some junto.
    and (root.id is null or not public.is_blocked_with(root.author_id))
  order by coalesce(root.created_at, c.created_at), coalesce(root.id, c.id), c.parent_id nulls first, c.created_at, c.id
  limit 500;
$$;
grant execute on function public.post_comments(uuid) to authenticated;

-- ---------------------------------------------------------------- gênero só com música

-- O gênero descreve a música: post sem música não tem gênero.
update public.posts set genres = '{}' where link_preview_id is null and cardinality(genres) > 0;
alter table public.posts add constraint posts_genres_need_music check (link_preview_id is not null or cardinality(genres) = 0);

create or replace function public.post_create(
  p_body text default '',
  p_link_preview_id uuid default null,
  p_genres text[] default '{}',
  p_media jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_count int := coalesce(jsonb_array_length(p_media), 0);
  v_videos int;
  v_id uuid;
  v_item jsonb;
  v_pos int := 0;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'post_text_too_long';
  end if;
  if jsonb_typeof(coalesce(p_media, '[]')) <> 'array' or v_count > 4 then
    raise exception 'invalid_media';
  end if;
  select count(*) into v_videos from jsonb_array_elements(coalesce(p_media, '[]')) e where e ->> 'kind' = 'video';
  if v_videos > 1 or (v_videos = 1 and v_count > 1) then
    raise exception 'invalid_media'; -- até 4 fotos OU 1 vídeo
  end if;
  if p_link_preview_id is null and v_count = 0 and v_body = '' then
    raise exception 'post_empty';
  end if;
  if p_link_preview_id is null and cardinality(coalesce(p_genres, '{}')) > 0 then
    raise exception 'genres_need_music';
  end if;
  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]')) loop
    if split_part(v_item ->> 'path', '/', 1) <> v_me::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'post-media' and o.name = v_item ->> 'path')
       or exists (select 1 from public.post_media m where m.path = v_item ->> 'path') then
      raise exception 'invalid_media';
    end if;
  end loop;

  insert into public.posts (author_id, body, link_preview_id, genres, type)
  values (
    v_me, v_body, p_link_preview_id, coalesce(p_genres, '{}'),
    case when p_link_preview_id is not null then 'music' when v_count > 0 then 'media' else 'text' end
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]')) loop
    insert into public.post_media (post_id, position, kind, path, width, height, duration_ms)
    values (
      v_id, v_pos, v_item ->> 'kind', v_item ->> 'path',
      least(greatest((v_item ->> 'width')::int, 1), 4096),
      least(greatest((v_item ->> 'height')::int, 1), 4096),
      case when v_item ->> 'kind' = 'video' then (v_item ->> 'duration_ms')::int end
    );
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end;
$$;
