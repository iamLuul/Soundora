-- Descobrir pela plataforma de cada pessoa: quem escolheu a Deezer ouve prévias e vê capas da
-- Deezer; quem escolheu a Apple Music, da Apple; nas outras plataformas (que não oferecem
-- prévia para apps novos), só o link e a capa daquela plataforma. Nada de áudio ou capa de uma
-- loja junto do link de outra (os termos das APIs não permitem).
--
-- platform_tracks guarda, por música (cartão da Deezer) e plataforma, o que achamos nela.
-- Só a Edge Function discover escreve e lê (chave secreta); o app recebe pelo Descobrir e
-- pelas listas de curtidas.

create table public.platform_tracks (
  link_preview_id uuid not null references public.link_previews (id) on delete cascade,
  platform text not null check (platform in ('spotify', 'apple_music', 'deezer', 'youtube_music', 'amazon_music', 'tidal', 'soundcloud')),
  -- false = procurada e não achada nessa plataforma
  found boolean not null,
  url text check (url ~ '^https://'),
  image_url text check (image_url ~ '^https://'),
  audio_url text check (audio_url ~ '^https://'),
  checked_at timestamptz not null default now(),
  primary key (link_preview_id, platform)
);
alter table public.platform_tracks enable row level security;
revoke all on public.platform_tracks from anon, authenticated;

-- Plataforma escolhida por quem está logado (null = ainda não escolheu).
create function private.viewer_platform() returns text
language sql stable security definer set search_path = '' as $$
  select streaming_platform from public.profile_private where user_id = auth.uid();
$$;
revoke execute on function private.viewer_platform() from public;

-- Capa na plataforma de quem vê: a do próprio cartão se for da mesma plataforma, senão a que
-- achamos nela; sem nada, null (o app mostra um cartão ilustrado).
create function private.cover_for_viewer(p_preview uuid, p_platform text, p_image text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when private.viewer_platform() is null then null
    when p_platform = private.viewer_platform() then p_image
    else (select pt.image_url from public.platform_tracks pt
          where pt.link_preview_id = p_preview and pt.platform = private.viewer_platform() and pt.found)
  end;
$$;
revoke execute on function private.cover_for_viewer(uuid, text, text) from public;

create or replace function public.discover_liked(p_limit integer default 50)
returns table (link_preview_id uuid, url text, platform text, title text, artist text, album text, image_url text, liked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select lp.id, lp.url, lp.platform, lp.title, lp.artist, lp.album,
         private.cover_for_viewer(lp.id, lp.platform, lp.image_url), s.created_at
  from public.discover_swipes s
  join public.link_previews lp on lp.id = s.link_preview_id
  where s.user_id = auth.uid() and s.liked
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

create or replace function public.profile_liked_songs(p_user uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 30)
returns table (link_preview_id uuid, url text, platform text, title text, artist text, album text, image_url text, liked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select lp.id, lp.url, lp.platform, lp.title, lp.artist, lp.album,
         private.cover_for_viewer(lp.id, lp.platform, lp.image_url), s.created_at
  from public.discover_swipes s
  join public.link_previews lp on lp.id = s.link_preview_id
  where auth.uid() is not null
    and s.user_id = p_user
    and s.liked
    and not public.content_hidden(p_user)
    and (p_before is null or (s.created_at, s.link_preview_id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by s.created_at desc, s.link_preview_id desc
  limit least(greatest(p_limit, 1), 50);
$$;
