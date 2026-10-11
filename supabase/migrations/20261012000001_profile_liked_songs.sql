-- Perfil › Curtidas: agora são as músicas curtidas no Descobrir (não mais os posts curtidos).
-- Como os posts curtidos antes, a lista é visível para quem está logado e não tem bloqueio
-- com a pessoa. Lida só por esta função (discover_swipes segue fechada: só a dona vê).

create or replace function public.profile_summary(p_username text)
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text, banner_url text,
  followers int, following int, posts int, likes int, is_me boolean, i_follow boolean
)
language sql stable security definer set search_path = '' as $$
  select
    pr.id, pr.username, pr.display_name, pr.bio, pr.avatar_url, pr.banner_url,
    (select count(*)::int from public.follows f where f.followee_id = pr.id),
    (select count(*)::int from public.follows f where f.follower_id = pr.id),
    (select count(*)::int from public.posts p where p.author_id = pr.id),
    (select count(*)::int from public.discover_swipes s where s.user_id = pr.id and s.liked),
    pr.id = auth.uid(),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
  from public.profiles pr
  where pr.username = lower(p_username)
    and not public.is_blocked_with(pr.id);
$$;

-- Músicas curtidas de uma pessoa (a mais recente primeiro), em páginas.
create function public.profile_liked_songs(
  p_user uuid,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 30
)
returns table (
  link_preview_id uuid,
  url text,
  platform text,
  title text,
  artist text,
  album text,
  image_url text,
  liked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select lp.id, lp.url, lp.platform, lp.title, lp.artist, lp.album, lp.image_url, s.created_at
  from public.discover_swipes s
  join public.link_previews lp on lp.id = s.link_preview_id
  where auth.uid() is not null
    and s.user_id = p_user
    and s.liked
    and not public.is_blocked_with(p_user)
    and (p_before is null or (s.created_at, s.link_preview_id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.created_at desc, s.link_preview_id desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.profile_liked_songs(uuid, timestamptz, uuid, int) from public, anon;
grant execute on function public.profile_liked_songs(uuid, timestamptz, uuid, int) to authenticated;

create index if not exists discover_swipes_liked on public.discover_swipes (user_id, created_at desc, link_preview_id desc) where liked;
