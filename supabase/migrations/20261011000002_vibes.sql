-- Vibes: como os Stories. Foto, vídeo, texto, card de música ou post compartilhado,
-- visível por 24 horas para quem está logado (menos quem tem bloqueio com o autor).
--
-- A mídia (foto/vídeo) fica no bucket PRIVADO "vibes". Só a Edge Function vibe-media grava
-- nele (depois de conferir o arquivo), e só dá para baixar com URL assinada enquanto a vibe
-- estiver ativa e sem bloqueio. O app lê e cria tudo pelas funções abaixo.

create table public.vibes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video', 'text', 'music', 'post')),
  -- Caminho dentro do bucket "vibes": {author_id}/{uuid}.jpg|mp4
  media_path text unique,
  duration_ms int check (duration_ms between 1 and 31000),
  text text check (char_length(text) <= 300),
  -- Cor de fundo da vibe de texto/música/post.
  style text not null default 'violet' check (style in ('violet', 'blue', 'pink', 'green', 'orange', 'dark')),
  link_preview_id uuid references public.link_previews (id),
  post_id uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (media_path is null or media_path ~ ('^' || author_id::text || '/[0-9a-f-]{36}\.(jpg|mp4)$')),
  -- coalesce: um teste com NULL daria "desconhecido", e o CHECK deixaria passar.
  check (coalesce(case kind
    when 'photo' then media_path ~ '\.jpg$' and link_preview_id is null and post_id is null
    when 'video' then media_path ~ '\.mp4$' and duration_ms is not null and link_preview_id is null and post_id is null
    when 'text' then media_path is null and char_length(btrim(coalesce(text, ''))) > 0 and link_preview_id is null and post_id is null
    when 'music' then media_path is null and link_preview_id is not null and post_id is null
    when 'post' then media_path is null and post_id is not null and link_preview_id is null
  end, false))
);
create index vibes_author_created on public.vibes (author_id, created_at desc);
create index vibes_created on public.vibes (created_at);

create table public.vibe_views (
  vibe_id uuid not null references public.vibes (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (vibe_id, viewer_id)
);
create index vibe_views_viewer on public.vibe_views (viewer_id);

alter table public.vibes enable row level security;
alter table public.vibe_views enable row level security;
-- Fechadas para o app: só as funções abaixo leem e escrevem.
revoke all on public.vibes, public.vibe_views from anon, authenticated;

create trigger rate_limit before insert on public.vibes
  for each row execute function private.tg_rate_limit('vibe', '30', '1 day');

-- Denunciar uma vibe.
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'profile', 'vibe'));

-- ---------------------------------------------------------------- regras de visibilidade

-- Ativa = criada nas últimas 24 horas.
create function private.vibe_active(p_created timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_created > now() - interval '24 hours';
$$;
revoke execute on function private.vibe_active(timestamptz) from public;

-- Usada pela policy do Storage: a mídia só abre se a vibe estiver ativa e sem bloqueio.
create function public.vibe_media_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vibes v
    where v.media_path = p_name
      and private.vibe_active(v.created_at)
      and not public.is_blocked_with(v.author_id)
  );
$$;
revoke execute on function public.vibe_media_visible(text) from public, anon;
grant execute on function public.vibe_media_visible(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Privado, até 30 MB, só JPEG e MP4. Sem policy de escrita: só a Edge Function grava.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('vibes', 'vibes', false, 31457280, array['image/jpeg', 'video/mp4'])
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists "vibes: ver mídia ativa" on storage.objects;
    create policy "vibes: ver mídia ativa" on storage.objects for select to authenticated
      using (bucket_id = 'vibes' and public.vibe_media_visible(name));
  end if;
end $$;

-- ---------------------------------------------------------------- criar e apagar

create function public.vibe_create(
  p_kind text,
  p_media_path text default null,
  p_duration_ms int default null,
  p_text text default null,
  p_style text default 'violet',
  p_link_preview_id uuid default null,
  p_post_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_post_author uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_authenticated';
  end if;

  if p_media_path is not null then
    -- O arquivo tem que ser meu, ter passado pela Edge Function (existir no bucket) e não
    -- estar em outra vibe.
    if split_part(p_media_path, '/', 1) <> v_me::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'vibes' and o.name = p_media_path)
       or exists (select 1 from public.vibes v where v.media_path = p_media_path) then
      raise exception 'invalid_media';
    end if;
  end if;

  if p_post_id is not null then
    select author_id into v_post_author from public.posts where id = p_post_id;
    if v_post_author is null or public.is_blocked_with(v_post_author) then
      raise exception 'not_found';
    end if;
  end if;

  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;

  -- Limpa as minhas vibes vencidas (a mídia sai na próxima vez que a Edge Function rodar).
  delete from public.vibes where author_id = v_me and not private.vibe_active(created_at);

  insert into public.vibes (author_id, kind, media_path, duration_ms, text, style, link_preview_id, post_id)
  values (v_me, p_kind, p_media_path, p_duration_ms, nullif(btrim(p_text), ''), coalesce(p_style, 'violet'), p_link_preview_id, p_post_id)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.vibe_delete(p_vibe uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.vibes where id = p_vibe and author_id = auth.uid();
$$;

-- ---------------------------------------------------------------- ver

-- Fila do topo da Home: eu primeiro (se tiver vibe), depois quem eu sigo com vibe ativa;
-- quem tem vibe que eu ainda não vi vem antes.
create function public.vibes_tray()
returns table (
  author_id uuid,
  username text,
  display_name text,
  avatar_url text,
  vibe_count int,
  unseen boolean,
  latest_at timestamptz,
  is_me boolean
)
language sql stable security definer set search_path = '' as $$
  with authors as (
    select auth.uid() as id
    union
    select f.followee_id from public.follows f where f.follower_id = auth.uid()
  )
  select
    p.id, p.username, p.display_name, p.avatar_url,
    count(v.id)::int,
    bool_or(v.author_id <> auth.uid() and not exists (
      select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()
    )),
    max(v.created_at),
    p.id = auth.uid()
  from authors a
  join public.profiles p on p.id = a.id
  join public.vibes v on v.author_id = p.id and private.vibe_active(v.created_at)
  where not public.is_blocked_with(p.id)
  group by p.id
  order by (p.id = auth.uid()) desc,
           bool_or(v.author_id <> auth.uid() and not exists (
             select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()
           )) desc,
           max(v.created_at) desc
  limit 100;
$$;

-- Vibes ativas de uma pessoa, da mais antiga para a mais nova (ordem de exibição).
create function public.vibes_of(p_author uuid)
returns table (
  id uuid,
  kind text,
  media_path text,
  duration_ms int,
  text text,
  style text,
  created_at timestamptz,
  seen boolean,
  view_count int,
  preview_url text,
  preview_platform text,
  preview_title text,
  preview_artist text,
  preview_image_url text,
  post_id uuid,
  post_body text,
  post_author_username text,
  post_author_avatar_url text
)
language sql stable security definer set search_path = '' as $$
  select
    v.id, v.kind, v.media_path, v.duration_ms, v.text, v.style, v.created_at,
    exists (select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()),
    -- Quantas pessoas viram: só para o autor.
    case when v.author_id = auth.uid() then (select count(*)::int from public.vibe_views w where w.vibe_id = v.id) end,
    coalesce(lp.url, plp.url), coalesce(lp.platform, plp.platform), coalesce(lp.title, plp.title),
    coalesce(lp.artist, plp.artist), coalesce(lp.image_url, plp.image_url),
    v.post_id, left(sp.body, 200), spa.username, spa.avatar_url
  from public.vibes v
  left join public.link_previews lp on lp.id = v.link_preview_id
  left join public.posts sp on sp.id = v.post_id
  left join public.profiles spa on spa.id = sp.author_id
  left join public.link_previews plp on plp.id = sp.link_preview_id
  where v.author_id = p_author
    and private.vibe_active(v.created_at)
    and not public.is_blocked_with(v.author_id)
    -- Post compartilhado de alguém com quem eu tenho bloqueio: não aparece.
    and (sp.author_id is null or not public.is_blocked_with(sp.author_id))
  order by v.created_at, v.id
  limit 100;
$$;

create function public.vibe_mark_seen(p_vibe uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.vibe_views (vibe_id, viewer_id)
  select v.id, auth.uid()
  from public.vibes v
  where v.id = p_vibe
    and v.author_id <> auth.uid()
    and private.vibe_active(v.created_at)
    and not public.is_blocked_with(v.author_id)
  on conflict do nothing;
$$;

-- Quem viu a minha vibe (só o autor consegue ver).
create function public.vibe_viewers(p_vibe uuid)
returns table (username text, display_name text, avatar_url text, viewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.username, p.display_name, p.avatar_url, w.viewed_at
  from public.vibes v
  join public.vibe_views w on w.vibe_id = v.id
  join public.profiles p on p.id = w.viewer_id
  where v.id = p_vibe and v.author_id = auth.uid()
  order by w.viewed_at desc
  limit 200;
$$;

grant execute on function
  public.vibe_create(text, text, int, text, text, uuid, uuid),
  public.vibe_delete(uuid),
  public.vibes_tray(),
  public.vibes_of(uuid),
  public.vibe_mark_seen(uuid),
  public.vibe_viewers(uuid)
to authenticated;

-- ---------------------------------------------------------------- limpeza (Edge Function)

-- Arquivos do bucket que já podem sair: de vibes vencidas/apagadas ou enviados e nunca usados.
-- Chamada pela Edge Function vibe-media (chave secreta) a cada envio.
create function public.vibe_media_garbage(p_user uuid)
returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'vibes'
    and o.name like p_user::text || '/%'
    and o.created_at < now() - interval '1 hour'
    and not exists (
      select 1 from public.vibes v where v.media_path = o.name and private.vibe_active(v.created_at)
    )
  limit 100;
$$;
revoke execute on function public.vibe_media_garbage(uuid) from public, anon, authenticated;
grant execute on function public.vibe_media_garbage(uuid) to service_role;
