-- Descobrir com recomendações: músicas sugeridas pelo que a pessoa curtiu e pelos gêneros
-- dela (Edge Function discover, Last.fm + Deezer), e a lista de músicas curtidas.

-- O cartão mostra álbum e foto do artista (a Deezer manda os dois).
alter table public.link_previews
  add column album text check (char_length(album) <= 200),
  add column artist_image_url text check (artist_image_url ~ '^https://');

-- Cache das buscas: "artista|título" (do Last.fm) → cartão da música (ou nenhum achado).
-- Evita procurar a mesma música na Deezer toda vez. Só a Edge Function lê e grava.
create table public.track_lookups (
  key text primary key check (char_length(key) between 3 and 300),
  link_preview_id uuid references public.link_previews (id) on delete cascade,
  checked_at timestamptz not null default now()
);
alter table public.track_lookups enable row level security;
revoke all on public.track_lookups from anon, authenticated;

-- Links por plataforma também a partir de músicas do Spotify, YouTube Music etc.
-- (as curtidas do Descobrir podem ter vindo de posts com links de qualquer plataforma).
alter table public.track_platform_links drop constraint track_platform_links_source_url_check;
alter table public.track_platform_links add constraint track_platform_links_source_url_check
  check (char_length(source_url) <= 500 and source_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}/\S+$');

-- Músicas que curti no Descobrir (a mais recente primeiro).
create function public.discover_liked(p_limit int default 50)
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
  where s.user_id = auth.uid() and s.liked
  order by s.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.discover_liked(int) from public, anon;
grant execute on function public.discover_liked(int) to authenticated;
