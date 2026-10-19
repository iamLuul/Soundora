-- Dados do cartão do Descobrir pelo Last.fm (track.getInfo): nome certo da música e do artista,
-- álbum e capa do álbum. Valem para qualquer plataforma; a plataforma escolhida só decide a
-- prévia e para onde o botão leva. Guardado por cartão, só o servidor lê e grava.
create table public.lastfm_tracks (
  link_preview_id uuid primary key references public.link_previews (id) on delete cascade,
  -- false = o Last.fm não conhece a música (procura de novo depois de um tempo)
  found boolean not null,
  title text check (char_length(title) <= 200),
  artist text check (char_length(artist) <= 200),
  album text check (char_length(album) <= 200),
  image_url text check (image_url ~ '^https://'),
  checked_at timestamptz not null default now()
);
alter table public.lastfm_tracks enable row level security;
revoke all on public.lastfm_tracks from anon, authenticated;
