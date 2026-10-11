-- Posts mais completos e perfil com listas.
--   1. Gêneros: até 3 por post, de toda a lista do app (não só os do perfil), com detecção
--      automática pelas lojas guardada no cartão da música (link_previews.genres).
--   2. Posts de texto, com imagens (até 4) ou vídeo (1), além do de música.
--   3. Post aberto (tela cheia), posts curtidos, seguidores e seguindo.

-- ---------------------------------------------------------------- 1. gêneros

alter table public.link_previews add column genres text[];

alter table public.posts add column genres text[] not null default '{}';
alter table public.posts add constraint posts_genres_max check (cardinality(genres) <= 3);
update public.posts set genres = array[genre] where genre is not null;
create index posts_genres on public.posts using gin (genres);

-- Confere os gêneros (têm que existir em public.genres), tira repetidos e mantém a coluna
-- antiga "genre" igual ao primeiro (usada no Descobrir e no Em alta).
create function private.tg_post_genres() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_clean text[];
begin
  if tg_op = 'UPDATE' and new.genres is not distinct from old.genres and new.genre is distinct from old.genre then
    new.genres := case when new.genre is null then '{}' else array[new.genre] end;
  elsif tg_op = 'INSERT' and cardinality(new.genres) = 0 and new.genre is not null then
    new.genres := array[new.genre];
  end if;
  select coalesce(array_agg(g order by ord), '{}') into v_clean
  from (select distinct on (g) g, ord from unnest(new.genres) with ordinality as t(g, ord) order by g, ord) x;
  if exists (select 1 from unnest(v_clean) g where not exists (select 1 from public.genres where slug = g)) then
    raise exception 'invalid_genre';
  end if;
  new.genres := v_clean;
  new.genre := v_clean[1];
  return new;
end;
$$;
revoke execute on function private.tg_post_genres() from public;
create trigger genres before insert or update of genre, genres on public.posts
  for each row execute function private.tg_post_genres();

-- ---------------------------------------------------------------- 2. posts de texto e mídia

alter table public.posts alter column link_preview_id drop not null;
alter table public.posts alter column type drop default;
alter table public.posts drop constraint posts_type_check;
alter table public.posts add constraint posts_type_check check (type in ('music', 'text', 'media'));

-- O tipo é definido pelo servidor: música se tem link, senão texto. "media" só pelo post_create.
create function private.tg_post_type() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type is null then
    new.type := case when new.link_preview_id is not null then 'music' else 'text' end;
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_post_type() from public;
create trigger type before insert on public.posts
  for each row execute function private.tg_post_type();

alter table public.posts add constraint posts_has_content check (
  case type
    when 'music' then link_preview_id is not null
    when 'text' then char_length(btrim(body)) > 0
    else true -- 'media': conferido no post_create (precisa de pelo menos um arquivo)
  end
);

-- Inserir direto só com estas colunas (o tipo e os contadores não são do app).
revoke insert on public.posts from anon, authenticated;
grant insert (author_id, body, link_preview_id, genre, genres) on public.posts to authenticated;
revoke update on public.posts from anon, authenticated;
grant update (body, genres) on public.posts to authenticated;

create table public.post_media (
  post_id uuid not null references public.posts (id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  kind text not null check (kind in ('photo', 'video')),
  -- Caminho no bucket "post-media": {autor}/{uuid}.jpg|mp4
  path text not null unique,
  width int not null check (width between 1 and 4096),
  height int not null check (height between 1 and 4096),
  duration_ms int check (duration_ms between 1 and 31000),
  primary key (post_id, position),
  check ((kind = 'photo' and path ~ '\.jpg$' and duration_ms is null) or (kind = 'video' and path ~ '\.mp4$' and duration_ms is not null))
);
alter table public.post_media enable row level security;
revoke all on public.post_media from anon, authenticated;

create function public.post_media_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.post_media m join public.posts p on p.id = m.post_id
    where m.path = p_name and not public.is_blocked_with(p.author_id)
  );
$$;
revoke execute on function public.post_media_visible(text) from public, anon;
grant execute on function public.post_media_visible(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Privado, até 30 MB, só JPEG e MP4. Grava só a Edge Function media-upload.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('post-media', 'post-media', false, 31457280, array['image/jpeg', 'video/mp4'])
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists "post-media: ver de post visível" on storage.objects;
    create policy "post-media: ver de post visível" on storage.objects for select to authenticated
      using (bucket_id = 'post-media' and public.post_media_visible(name));
  end if;
end $$;

-- Publicar: texto, música, gêneros e mídia (já conferida e gravada pela Edge Function).
-- p_media: [{ "path": "...", "kind": "photo"|"video", "width": 1080, "height": 1350, "duration_ms": 12000 }]
create function public.post_create(
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
  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;

  -- Cada arquivo: meu, gravado no bucket pela Edge Function e ainda não usado.
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
grant execute on function public.post_create(text, uuid, text[], jsonb) to authenticated;

-- Arquivos de post que podem sair: enviados e nunca usados (1 h de folga). Para a Edge Function.
create function public.post_media_garbage(p_user uuid)
returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'post-media'
    and o.name like p_user::text || '/%'
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.post_media m where m.path = o.name)
  limit 100;
$$;
revoke execute on function public.post_media_garbage(uuid) from public, anon, authenticated;
grant execute on function public.post_media_garbage(uuid) to service_role;

-- ---------------------------------------------------------------- feed com gêneros e mídia

alter type public.feed_item add attribute genres text[];
alter type public.feed_item add attribute media jsonb;
alter type public.feed_item add attribute post_type text;

-- Mídia do post, na ordem: [{ path, kind, width, height, duration_ms }]
create function private.post_media_json(p_post uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('path', m.path, 'kind', m.kind, 'width', m.width, 'height', m.height, 'duration_ms', m.duration_ms) order by m.position), '[]')
  from public.post_media m where m.post_id = p_post;
$$;
revoke execute on function private.post_media_json(uuid) from public;

create or replace function public.feed_for_you(p_limit int default 20, p_offset int default 0, p_now timestamptz default null)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid, least(coalesce(p_now, now()), now()) as at),
  my_genres as (select coalesce(array_agg(genre), '{}') as list from public.user_genres, me where user_id = me.uid),
  following as (select followee_id from public.follows, me where follower_id = me.uid)
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l, me where l.post_id = p.id and l.user_id = me.uid) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    (
      1
      + case when p.author_id in (select followee_id from following) then 3 else 0 end
      + case when p.author_id = (select uid from me) then 2 else 0 end
      + case when p.genres && (select list from my_genres) then 1 else 0 end
      + ln(1 + p.like_count) + 0.6 * ln(1 + p.comment_count)
    ) / power(extract(epoch from ((select at from me) - p.created_at)) / 3600.0 + 2, 1.3) as score,
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.created_at > (select at from me) - interval '14 days'
    and p.created_at <= (select at from me)
    and not public.is_blocked_with(p.author_id)
  order by score desc, p.created_at desc, p.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

create or replace function public.profile_posts(p_author uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.author_id = p_author
    and not public.is_blocked_with(p.author_id)
    and (
      p_before is null
      or p.created_at < p_before
      or (p_before_id is not null and p.created_at = p_before and p.id < p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------- 3. post aberto, curtidos, listas

create function public.post_detail(p_post uuid)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where p.id = p_post
    and not public.is_blocked_with(p.author_id);
$$;

-- Posts que uma pessoa curtiu, da curtida mais nova para a mais antiga. As curtidas já são
-- públicas (policy "curtidas são públicas"); posts de quem tem bloqueio comigo não aparecem.
-- Próxima página: p_after_post = último post da página anterior (o cursor é a curtida dele).
create function public.liked_posts(p_user uuid, p_after_post uuid default null, p_limit int default 20)
returns setof public.feed_item
language sql stable security definer set search_path = '' as $$
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes ml where ml.post_id = p.id and ml.user_id = auth.uid()),
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    0::double precision,
    p.genres, private.post_media_json(p.id), p.type
  from public.likes l
  join public.posts p on p.id = l.post_id
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where l.user_id = p_user
    and not public.is_blocked_with(p_user)
    and not public.is_blocked_with(p.author_id)
    and (
      p_after_post is null
      or (l.created_at, l.post_id) < (
        select c.created_at, c.post_id from public.likes c where c.user_id = p_user and c.post_id = p_after_post
      )
    )
  order by l.created_at desc, l.post_id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Seguidores (p_list = 'followers') ou quem a pessoa segue ('following').
create function public.profile_people(p_username text, p_list text, p_limit int default 30, p_offset int default 0)
returns table (id uuid, username text, display_name text, avatar_url text, bio text, i_follow boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with target as (
    select pr.id from public.profiles pr
    where pr.username = lower(p_username) and not public.is_blocked_with(pr.id)
  ), people as (
    select case when p_list = 'followers' then f.follower_id else f.followee_id end as person, f.created_at
    from public.follows f, target t
    where (p_list = 'followers' and f.followee_id = t.id) or (p_list = 'following' and f.follower_id = t.id)
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.bio,
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id),
         pr.id = auth.uid()
  from people x
  join public.profiles pr on pr.id = x.person
  where not public.is_blocked_with(pr.id)
  order by x.created_at desc, pr.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-- "Curtidas" no perfil passa a ser quantos posts a pessoa curtiu (abre a lista de curtidos).
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
    (select count(*)::int from public.likes l join public.posts p on p.id = l.post_id
      where l.user_id = pr.id and not public.is_blocked_with(p.author_id)),
    pr.id = auth.uid(),
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = pr.id)
  from public.profiles pr
  where pr.username = lower(p_username)
    and not public.is_blocked_with(pr.id);
$$;

grant execute on function
  public.post_detail(uuid),
  public.liked_posts(uuid, uuid, int),
  public.profile_people(text, text, int, int)
to authenticated;
