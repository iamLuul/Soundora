-- "Fulano curtiu sua review": notificação (lista, ao vivo e push) quando alguém curte uma review.
-- Curtir e descurtir a mesma review várias vezes avisa uma vez só; descurtir tira o aviso.

alter table public.notifications add column review_id uuid references public.album_reviews (id) on delete cascade;
create index if not exists notifications_review on public.notifications (review_id) where review_id is not null;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'reply', 'follow', 'comment_reply', 'comment_like', 'review_like'));

-- Seguir e curtir review não têm post; curtir review sempre tem a review.
alter table public.notifications drop constraint notifications_check1;
alter table public.notifications add constraint notifications_post_check
  check ((kind in ('follow', 'review_like')) = (post_id is null));
alter table public.notifications add constraint notifications_review_check
  check ((kind = 'review_like') = (review_id is not null));

create unique index notifications_review_like_once on public.notifications (user_id, actor_id, review_id) where kind = 'review_like';

create function private.tg_notify_review_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where kind = 'review_like' and actor_id = old.user_id and review_id = old.review_id;
    return old;
  end if;
  select author_id into v_author from public.album_reviews where id = new.review_id;
  if v_author is null or v_author = new.user_id or private.blocked_between(v_author, new.user_id) then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, kind, review_id)
  values (v_author, new.user_id, 'review_like', new.review_id)
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function private.tg_notify_review_like() from public;
create trigger notify after insert or delete on public.review_likes
  for each row execute function private.tg_notify_review_like();

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
      else jsonb_build_object('title', 'New follower', 'body', '@' || p_username || ' started following you')
    end
    else case p_kind
      when 'like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu post')
      when 'comment' then jsonb_build_object('title', '@' || p_username || ' comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'reply' then jsonb_build_object('title', '@' || p_username || ' também comentou', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_reply' then jsonb_build_object('title', '@' || p_username || ' respondeu você', 'body', left(coalesce(p_comment, ''), 120))
      when 'comment_like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu seu comentário')
      when 'review_like' then jsonb_build_object('title', 'Nova curtida', 'body', '@' || p_username || ' curtiu sua review')
      else jsonb_build_object('title', 'Novo seguidor', 'body', '@' || p_username || ' começou a seguir você')
    end
  end;
$$;

-- A lista agora traz o álbum da review (capa e título, e o id para abrir a tela do álbum).
drop function public.notifications_list(text, bigint, int);
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
  comment_body text,
  review_album_id uuid
)
language sql stable security definer set search_path = '' as $$
  select
    n.id, n.kind, n.created_at, n.read_at is not null,
    a.id, a.username, a.display_name, a.avatar_url,
    n.post_id, coalesce(lp.title, alb.title), coalesce(lp.image_url, alb.image_url),
    left(c.body, 140),
    r.album_id
  from public.notifications n
  join public.profiles a on a.id = n.actor_id
  left join public.posts p on p.id = n.post_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  left join public.comments c on c.id = n.comment_id
  left join public.album_reviews r on r.id = n.review_id
  left join public.link_previews alb on alb.id = r.album_id
  where n.user_id = auth.uid()
    and (p_filter <> 'replies' or n.kind in ('comment', 'reply', 'comment_reply'))
    and (p_before is null or n.id < p_before)
    and not public.is_blocked_with(n.actor_id)
  order by n.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.notifications_list(text, bigint, int) from public, anon;
grant execute on function public.notifications_list(text, bigint, int) to authenticated;
