-- Reviews de álbuns: a pessoa escolhe um álbum, dá uma nota de 0 a 10 (5 estrelas, cada
-- estrela vale 2 pontos, com uma casa decimal: 9,1) e escreve a análise. Outras pessoas veem
-- e curtem. Ficam na aba Músicas › Reviews.
--
-- - album_reviews: uma review por pessoa por álbum. O álbum é um cartão (link_previews) do
--   tipo "album", guardado pelo servidor (busca na Deezer ou link colado).
-- - review_likes: curtidas, com contador na review.
-- - reviews_feed: as reviews, da mais nova à mais velha (de todos, de uma pessoa ou de um
--   álbum), sem quem bloqueei ou me bloqueou.
-- - Denúncia de review e o painel admin (ver, remover).
-- Mesmas regras dos posts: limite de envios, conta suspensa não publica nem curte.

alter table public.link_previews add column if not exists release_date date;

-- ---------------------------------------------------------------- reviews

create table public.album_reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  album_id uuid not null references public.link_previews (id) on delete restrict,
  rating numeric(3, 1) not null check (rating between 0 and 10),
  body text not null check (char_length(btrim(body)) between 20 and 5000),
  like_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (author_id, album_id)
);
create index album_reviews_created on public.album_reviews (created_at desc, id desc);
create index album_reviews_author on public.album_reviews (author_id, created_at desc);
create index album_reviews_album on public.album_reviews (album_id, created_at desc);

alter table public.album_reviews enable row level security;
revoke all on public.album_reviews from anon, authenticated;
grant select, delete on public.album_reviews to authenticated;
grant insert (author_id, album_id, rating, body) on public.album_reviews to authenticated;

create policy "reviews visíveis" on public.album_reviews for select to authenticated
  using (not public.is_blocked_with(author_id));
create policy "publicar review" on public.album_reviews for insert to authenticated
  with check (author_id = auth.uid());
create policy "apagar a própria review" on public.album_reviews for delete to authenticated
  using (author_id = auth.uid());

-- Só álbum: o cartão tem que ser do tipo "album".
create function private.tg_review_album() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.link_previews lp where lp.id = new.album_id and lp.kind = 'album') then
    raise exception 'review_needs_album' using errcode = 'P0001';
  end if;
  new.body := btrim(new.body);
  return new;
end;
$$;
revoke execute on function private.tg_review_album() from public;
create trigger album before insert on public.album_reviews
  for each row execute function private.tg_review_album();
create trigger rate_limit before insert on public.album_reviews
  for each row execute function private.tg_rate_limit('review', '20', '1 hour');
create trigger block_suspended before insert on public.album_reviews
  for each row execute function private.tg_block_suspended('author_id');

-- ---------------------------------------------------------------- curtidas

create table public.review_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  review_id uuid not null references public.album_reviews (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);
create index review_likes_review on public.review_likes (review_id);
alter table public.review_likes enable row level security;
revoke all on public.review_likes from anon, authenticated;
grant select, delete on public.review_likes to authenticated;
grant insert (user_id, review_id) on public.review_likes to authenticated;

create policy "curtidas de reviews visíveis" on public.review_likes for select to authenticated
  using (not public.is_blocked_with(user_id));
create policy "curtir review" on public.review_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.album_reviews r where r.id = review_id and not public.is_blocked_with(r.author_id))
  );
create policy "descurtir review" on public.review_likes for delete to authenticated
  using (user_id = auth.uid());

create trigger rate_limit before insert on public.review_likes
  for each row execute function private.tg_rate_limit('review_like', '300', '1 hour');
create trigger block_suspended before insert on public.review_likes
  for each row execute function private.tg_block_suspended('user_id');

create function private.tg_review_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.album_reviews set like_count = like_count + 1 where id = new.review_id;
  else
    update public.album_reviews set like_count = greatest(like_count - 1, 0) where id = old.review_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.tg_review_like_count() from public;
create trigger like_count after insert or delete on public.review_likes
  for each row execute function private.tg_review_like_count();

-- ---------------------------------------------------------------- lista

create function public.reviews_feed(
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20,
  p_author uuid default null,
  p_album uuid default null
)
returns table (
  id uuid,
  rating numeric,
  body text,
  like_count int,
  liked_by_me boolean,
  created_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  album_id uuid,
  album_title text,
  album_artist text,
  album_image_url text,
  album_url text,
  album_platform text,
  album_year int
)
language plpgsql stable security definer set search_path = '' as $$
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
    and not public.is_blocked_with(r.author_id)
    and (p_before is null or (r.created_at, r.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, r.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;
revoke execute on function public.reviews_feed(timestamptz, uuid, int, uuid, uuid) from public, anon;
grant execute on function public.reviews_feed(timestamptz, uuid, int, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- denúncias e painel admin

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'profile', 'vibe', 'review'));
alter table public.admin_actions drop constraint admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'comment', 'profile', 'vibe', 'review'));

create or replace function public.admin_reports(p_status text default 'open', p_limit int default 30, p_offset int default 0)
returns table (
  target_type text,
  target_id uuid,
  report_count int,
  reasons text[],
  details text[],
  latest_at timestamptz,
  status text,
  exists_now boolean,
  preview text,
  post_id uuid,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  author_suspended_until timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  return query
  with grouped as (
    select r.target_type, r.target_id, count(*)::int as n,
           array_agg(distinct r.reason) as reasons,
           array_remove(array_agg(r.details order by r.created_at desc), null) as details,
           max(r.created_at) as latest_at
    from public.reports r
    where r.status = p_status
    group by r.target_type, r.target_id
    order by count(*) desc, max(r.created_at) desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  ),
  resolved as (
    select g.*,
      case g.target_type
        when 'post' then (select p.author_id from public.posts p where p.id = g.target_id)
        when 'comment' then (select c.author_id from public.comments c where c.id = g.target_id)
        when 'vibe' then (select v.author_id from public.vibes v where v.id = g.target_id)
        when 'review' then (select rv.author_id from public.album_reviews rv where rv.id = g.target_id)
        when 'profile' then (select pr.id from public.profiles pr where pr.id = g.target_id)
      end as author,
      case g.target_type
        when 'post' then (select coalesce(nullif(p.body, ''), lp.title) from public.posts p left join public.link_previews lp on lp.id = p.link_preview_id where p.id = g.target_id)
        when 'comment' then (select c.body from public.comments c where c.id = g.target_id)
        when 'vibe' then (select coalesce(nullif(v.text, ''), v.kind) from public.vibes v where v.id = g.target_id)
        when 'review' then (select lp.title || ' · ' || rv.rating || '/10 · ' || rv.body from public.album_reviews rv join public.link_previews lp on lp.id = rv.album_id where rv.id = g.target_id)
        when 'profile' then (select pr.display_name || coalesce(' · ' || pr.bio, '') from public.profiles pr where pr.id = g.target_id)
      end as preview,
      case g.target_type
        when 'post' then g.target_id
        when 'comment' then (select c.post_id from public.comments c where c.id = g.target_id)
      end as post_id
    from grouped g
  )
  select x.target_type, x.target_id, x.n, x.reasons, x.details[1:5], x.latest_at, p_status,
         x.author is not null, left(x.preview, 300), x.post_id,
         x.author, a.username, a.avatar_url, a.suspended_until
  from resolved x
  left join public.profiles a on a.id = x.author
  order by x.n desc, x.latest_at desc;
end;
$$;

create or replace function public.admin_resolve(p_target_type text, p_target_id uuid, p_action text)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  perform private.require_admin();
  if p_action not in ('dismiss', 'remove') or p_target_type not in ('post', 'comment', 'profile', 'vibe', 'review') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_action = 'remove' then
    case p_target_type
      when 'post' then delete from public.posts where id = p_target_id;
      when 'comment' then delete from public.comments where id = p_target_id;
      when 'vibe' then delete from public.vibes where id = p_target_id;
      when 'review' then delete from public.album_reviews where id = p_target_id;
      else raise exception 'cannot_remove_profile' using errcode = 'P0001';
    end case;
  end if;
  update public.reports
  set status = case when p_action = 'remove' then 'resolved' else 'dismissed' end, resolved_at = now()
  where target_type = p_target_type and target_id = p_target_id and status = 'open';
  get diagnostics v_count = row_count;
  perform private.log_admin(p_action, p_target_type, p_target_id, jsonb_build_object('reports', v_count));
  return v_count;
end;
$$;

-- Denúncias contra a pessoa também contam as das reviews dela.
create or replace function public.admin_users(
  p_query text default '',
  p_filter text default 'all',
  p_sort text default 'relevance',
  p_limit int default 50
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  suspended_until timestamptz,
  is_admin boolean,
  created_at timestamptz,
  post_count int,
  open_reports int,
  follower_count int
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  perform private.require_admin();
  if p_filter not in ('all', 'verified', 'regular', 'admin', 'suspended', 'reported')
     or p_sort not in ('relevance', 'followers_desc', 'followers_asc', 'name_asc', 'name_desc') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  return query
  with against as (
    select coalesce(p.author_id, c.author_id, v.author_id, rv.author_id, pr.id) as uid, count(*)::int as n
    from public.reports r
    left join public.posts p on r.target_type = 'post' and p.id = r.target_id
    left join public.comments c on r.target_type = 'comment' and c.id = r.target_id
    left join public.vibes v on r.target_type = 'vibe' and v.id = r.target_id
    left join public.album_reviews rv on r.target_type = 'review' and rv.id = r.target_id
    left join public.profiles pr on r.target_type = 'profile' and pr.id = r.target_id
    where r.status = 'open'
    group by 1
  ),
  people as (
    select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.verified, pr.suspended_until, pr.created_at,
           exists (select 1 from public.admins ad where ad.user_id = pr.id) as admin,
           coalesce(a.n, 0) as reports,
           coalesce(pr.suspended_until > now(), false) as suspended
    from public.profiles pr
    left join against a on a.uid = pr.id
    where q = ''
       or pr.username like '%' || replace(replace(q, '@', ''), '%', '') || '%'
       or lower(pr.display_name) like '%' || replace(q, '%', '') || '%'
  ),
  filtered as (
    select x.*, (select count(*)::int from public.follows f where f.followee_id = x.id) as followers
    from people x
    where case p_filter
      when 'verified' then x.verified
      when 'admin' then x.admin
      when 'suspended' then x.suspended
      when 'reported' then x.reports > 0
      when 'regular' then not x.verified and not x.admin and not x.suspended
      else true
    end
  )
  select f.id, f.username, f.display_name, f.avatar_url, f.verified, f.suspended_until, f.admin, f.created_at,
         (select count(*)::int from public.posts p where p.author_id = f.id),
         f.reports, f.followers
  from filtered f
  order by
    case when p_sort = 'relevance' and q <> '' and f.username = replace(q, '@', '') then 0 else 1 end,
    case when p_sort = 'followers_desc' then f.followers end desc nulls last,
    case when p_sort = 'followers_asc' then f.followers end asc nulls last,
    case when p_sort = 'name_asc' then f.username end asc,
    case when p_sort = 'name_desc' then f.username end desc,
    case when p_sort = 'relevance' then f.reports end desc,
    case when p_sort = 'relevance' then f.suspended end desc,
    f.created_at desc
  limit least(greatest(p_limit, 1), 100);
end;
$$;
