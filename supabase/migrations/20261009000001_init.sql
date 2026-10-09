-- Soundora — esquema inicial do MVP
-- Tudo em public é protegido por Row Level Security (RLS). Os clientes usam
-- a chave pública; o que cada pessoa pode ler ou escrever está nas policies.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-------------------------------------------------------------------------------
-- Configuração do app (linha única). Idade mínima ainda em decisão.
-------------------------------------------------------------------------------
create table public.app_config (
  id boolean primary key default true check (id),
  min_age int not null default 13 check (min_age between 13 and 21),
  guardian_required_under int not null default 16,
  guardian_flow_enabled boolean not null default false
);
insert into public.app_config default values;

alter table public.app_config enable row level security;
create policy "config é pública" on public.app_config for select using (true);

-------------------------------------------------------------------------------
-- Gêneros
-------------------------------------------------------------------------------
create table public.genres (
  slug text primary key check (slug ~ '^[a-z0-9_]+$'),
  name_pt text not null,
  name_en text not null
);
alter table public.genres enable row level security;
create policy "gêneros são públicos" on public.genres for select using (true);

-------------------------------------------------------------------------------
-- Perfis
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_.]{3,20}$' and username !~ '^\.|\.$|\.\.'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  bio text check (char_length(bio) <= 160),
  avatar_url text,
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'en')),
  created_at timestamptz not null default now()
);
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- Dados que só a própria pessoa vê (data de nascimento, menoridade).
create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  birthdate date not null,
  is_minor boolean not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_genres (
  user_id uuid not null references public.profiles (id) on delete cascade,
  genre text not null references public.genres (slug),
  primary key (user_id, genre)
);

-------------------------------------------------------------------------------
-- Moderação: administradores, bloqueios e denúncias
-------------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

-- true quando a pessoa logada bloqueou `other` ou foi bloqueada por ela.
create function public.is_blocked_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  );
$$;

-------------------------------------------------------------------------------
-- Seguir
-------------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);

-------------------------------------------------------------------------------
-- Cartões de prévia gerados pelo indexador de links (escritos só pela Edge Function)
-------------------------------------------------------------------------------
create table public.link_previews (
  id uuid primary key default gen_random_uuid(),
  url text not null unique check (url ~ '^https://'),
  platform text not null check (platform in (
    'spotify', 'apple_music', 'deezer', 'youtube_music', 'youtube', 'soundcloud', 'tidal', 'amazon_music', 'bandcamp')),
  kind text not null check (kind in ('track', 'album', 'artist', 'playlist', 'video', 'unknown')),
  provider_id text,
  title text not null check (char_length(title) <= 200),
  artist text check (char_length(artist) <= 200),
  image_url text check (image_url ~ '^https://'),
  fetched_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Posts, curtidas e comentários
-------------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  type text not null default 'music' check (type in ('music')),
  body text not null default '' check (char_length(body) <= 500),
  link_preview_id uuid not null references public.link_previews (id),
  genre text references public.genres (slug),
  like_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now()
);
create index posts_created on public.posts (created_at desc);
create index posts_author_created on public.posts (author_id, created_at desc);

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index likes_post on public.likes (post_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_post_created on public.comments (post_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'copyright', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_id, target_type, target_id)
);
create index reports_open on public.reports (created_at) where status = 'open';

-------------------------------------------------------------------------------
-- Contadores e efeitos colaterais (triggers)
-------------------------------------------------------------------------------
create function public.tg_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger likes_count after insert or delete on public.likes
  for each row execute function public.tg_like_count();

create function public.tg_comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.tg_comment_count();

-- Bloquear desfaz o "seguir" nos dois sentidos.
create function public.tg_block_unfollow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return null;
end $$;
create trigger blocks_unfollow after insert on public.blocks
  for each row execute function public.tg_block_unfollow();

-------------------------------------------------------------------------------
-- Onboarding: cria o perfil aplicando a regra de idade no servidor
-------------------------------------------------------------------------------
create function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_birthdate date,
  p_genres text[],
  p_locale text default 'pt-BR'
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.app_config;
  v_age int;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'already_onboarded' using errcode = 'P0001';
  end if;

  select * into cfg from public.app_config;
  v_age := date_part('year', age(current_date, p_birthdate))::int;
  if p_birthdate > current_date or v_age > 120 then
    raise exception 'birthdate_invalid' using errcode = 'P0001';
  end if;
  if v_age < cfg.min_age then
    raise exception 'too_young' using errcode = 'P0001';
  end if;
  if v_age < cfg.guardian_required_under and not cfg.guardian_flow_enabled then
    raise exception 'needs_guardian' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_genres, 1), 0) < 3 then
    raise exception 'genres_too_few' using errcode = 'P0001';
  end if;

  begin
    insert into public.profiles (id, username, display_name, locale)
    values (auth.uid(), lower(trim(p_username)), trim(p_display_name), p_locale)
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;

  insert into public.profile_private (user_id, birthdate, is_minor)
  values (auth.uid(), p_birthdate, v_age < 18);

  insert into public.user_genres (user_id, genre)
  select auth.uid(), g from unnest(p_genres) as g
  on conflict do nothing;

  return v_profile;
end $$;

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_genres enable row level security;
alter table public.admins enable row level security;
alter table public.blocks enable row level security;
alter table public.follows enable row level security;
alter table public.link_previews enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;

-- Perfis: públicos (inclusive para páginas web sem login), exceto entre bloqueados.
create policy "perfis visíveis" on public.profiles for select
  using (not public.is_blocked_with(id));
create policy "editar o próprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Só estes campos podem ser editados pelo app; username e id não.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_url, locale) on public.profiles to authenticated;

create policy "dados privados só do dono" on public.profile_private for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.profile_private from anon, authenticated;

create policy "gêneros dos perfis são públicos" on public.user_genres for select using (true);
create policy "adicionar meus gêneros" on public.user_genres for insert to authenticated
  with check (user_id = auth.uid());
create policy "remover meus gêneros" on public.user_genres for delete to authenticated
  using (user_id = auth.uid());

create policy "admin vê admins" on public.admins for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.admins from anon, authenticated;

create policy "ver meus bloqueios" on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "bloquear" on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "desbloquear" on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

create policy "seguidores são públicos" on public.follows for select using (true);
create policy "seguir" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_with(followee_id));
create policy "deixar de seguir" on public.follows for delete to authenticated
  using (follower_id = auth.uid());

create policy "prévias são públicas" on public.link_previews for select using (true);
revoke insert, update, delete on public.link_previews from anon, authenticated;

create policy "posts visíveis" on public.posts for select
  using (not public.is_blocked_with(author_id));
create policy "publicar" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid()));
create policy "editar meu post" on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "apagar meu post ou moderar" on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());
revoke update on public.posts from anon, authenticated;
grant update (body, genre) on public.posts to authenticated;

create policy "curtidas são públicas" on public.likes for select using (true);
create policy "curtir" on public.likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and not public.is_blocked_with(p.author_id))
  );
create policy "descurtir" on public.likes for delete to authenticated using (user_id = auth.uid());
revoke update on public.likes from anon, authenticated;

create policy "comentários visíveis" on public.comments for select
  using (not public.is_blocked_with(author_id));
create policy "comentar" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and not public.is_blocked_with(p.author_id))
  );
create policy "apagar comentário (autor, dono do post ou admin)" on public.comments for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );
revoke update on public.comments from anon, authenticated;

create policy "ver minhas denúncias ou todas (admin)" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy "denunciar" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy "admin resolve denúncias" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke update on public.reports from anon, authenticated;
grant update (status, resolved_at) on public.reports to authenticated;

revoke execute on function public.complete_onboarding(text, text, date, text[], text) from public, anon;
grant execute on function public.complete_onboarding(text, text, date, text[], text) to authenticated;
