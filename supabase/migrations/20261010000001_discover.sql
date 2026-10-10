-- Descobrir, Em alta e busca de músicas.

-------------------------------------------------------------------------------
-- Curadoria: músicas em destaque escolhidas por administradores.
-- Aparecem primeiro no Descobrir, dentro da janela starts_at..ends_at.
-------------------------------------------------------------------------------
create table public.featured (
  id uuid primary key default gen_random_uuid(),
  link_preview_id uuid not null references public.link_previews (id) on delete cascade,
  genre text references public.genres (slug),
  note_pt text check (char_length(note_pt) <= 140),
  note_en text check (char_length(note_en) <= 140),
  position int not null default 100,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index featured_active on public.featured (position, starts_at);

alter table public.featured enable row level security;
create policy "destaques ativos são públicos" on public.featured for select
  using (starts_at <= now() and (ends_at is null or ends_at > now()) or public.is_admin());
create policy "admin cria destaques" on public.featured for insert to authenticated with check (public.is_admin());
create policy "admin edita destaques" on public.featured for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin apaga destaques" on public.featured for delete to authenticated using (public.is_admin());

-------------------------------------------------------------------------------
-- Swipes do Descobrir: cada música aparece uma vez por pessoa.
-------------------------------------------------------------------------------
create table public.discover_swipes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  link_preview_id uuid not null references public.link_previews (id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, link_preview_id)
);

alter table public.discover_swipes enable row level security;
create policy "ver meus swipes" on public.discover_swipes for select to authenticated using (user_id = auth.uid());
create policy "registrar meu swipe" on public.discover_swipes for insert to authenticated with check (user_id = auth.uid());
create policy "refazer meu swipe" on public.discover_swipes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "apagar meu swipe" on public.discover_swipes for delete to authenticated using (user_id = auth.uid());

-- Busca de músicas por título e artista.
create index link_previews_title_trgm on public.link_previews using gin (title extensions.gin_trgm_ops);
create index link_previews_artist_trgm on public.link_previews using gin (artist extensions.gin_trgm_ops);
create index posts_preview on public.posts (link_preview_id, created_at desc);

-------------------------------------------------------------------------------
-- Cartão do Descobrir: uma música + quem indicou + por quê.
-------------------------------------------------------------------------------
create type public.discover_card as (
  link_preview_id uuid,
  url text,
  platform text,
  kind text,
  title text,
  artist text,
  image_url text,
  genre text,
  source text,          -- 'featured' (curadoria) ou 'community' (post de alguém)
  note text,            -- texto da curadoria, no idioma da pessoa
  post_id uuid,         -- post de origem, quando veio da comunidade
  recommender_username text,
  recommender_display_name text,
  recommender_avatar_url text
);

-- Ordem: 1) destaques ativos (pelo gênero da pessoa primeiro); 2) músicas postadas nos
-- últimos 30 dias nos gêneros da pessoa, por quem ela ainda não segue, mais curtidas primeiro.
-- Nunca repete música já vista (swipe), nem posts próprios ou de bloqueados.
create function public.discover_cards(p_limit int default 20)
returns setof public.discover_card
language sql stable security definer set search_path = '' as $$
  with me as (
    select auth.uid() as uid,
           coalesce((select locale from public.profiles where id = auth.uid()), 'pt-BR') as locale
  ),
  my_genres as (select genre from public.user_genres, me where user_id = me.uid),
  seen as (select link_preview_id from public.discover_swipes, me where user_id = me.uid),
  feat as (
    select distinct on (f.link_preview_id)
      f.link_preview_id, f.genre,
      case when (select locale from me) = 'en' then coalesce(f.note_en, f.note_pt) else coalesce(f.note_pt, f.note_en) end as note,
      0 as bucket,
      (case when f.genre in (select genre from my_genres) then 0 else 1 end) * 100000 + f.position as rank
    from public.featured f
    where f.starts_at <= now() and (f.ends_at is null or f.ends_at > now())
      and f.link_preview_id not in (select link_preview_id from seen)
    order by f.link_preview_id, f.position
  ),
  community as (
    select distinct on (p.link_preview_id)
      p.link_preview_id, p.genre, p.id as post_id, p.author_id, p.like_count, p.created_at
    from public.posts p, me
    where p.created_at > now() - interval '30 days'
      and p.author_id <> me.uid
      and p.author_id not in (select followee_id from public.follows where follower_id = me.uid)
      and not public.is_blocked_with(p.author_id)
      and p.link_preview_id not in (select link_preview_id from seen)
      and p.link_preview_id not in (select link_preview_id from feat)
      and (p.genre in (select genre from my_genres) or not exists (select 1 from my_genres))
    order by p.link_preview_id, p.like_count desc, p.created_at desc
  ),
  merged as (
    select link_preview_id, genre, note, null::uuid as post_id, null::uuid as author_id, 0 as bucket, rank::double precision as rank
    from feat
    union all
    select link_preview_id, genre, null, post_id, author_id, 1,
           -(ln(1 + like_count) + extract(epoch from created_at) / 864000.0)
    from community
  )
  select
    m.link_preview_id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url, m.genre,
    case when m.bucket = 0 then 'featured' else 'community' end,
    m.note, m.post_id, a.username, a.display_name, a.avatar_url
  from merged m
  join public.link_previews lp on lp.id = m.link_preview_id
  left join public.profiles a on a.id = m.author_id
  order by m.bucket, m.rank, m.link_preview_id
  limit least(greatest(p_limit, 1), 50);
$$;

-- Registra o swipe. Swipe para a direita também curte o post de origem.
create function public.discover_swipe(p_link_preview_id uuid, p_liked boolean, p_post_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.discover_swipes (user_id, link_preview_id, liked)
  values (auth.uid(), p_link_preview_id, p_liked)
  on conflict (user_id, link_preview_id) do update set liked = excluded.liked, created_at = now();

  if p_liked and p_post_id is not null then
    insert into public.likes (user_id, post_id)
    select auth.uid(), p.id from public.posts p
    where p.id = p_post_id and p.link_preview_id = p_link_preview_id and not public.is_blocked_with(p.author_id)
    on conflict do nothing;
  end if;
end $$;

-------------------------------------------------------------------------------
-- Em alta: músicas mais postadas e curtidas no período (padrão: 7 dias).
-- Pontuação = posts * 3 + curtidas. Cada pessoa conta uma vez por música.
-------------------------------------------------------------------------------
create function public.trending_tracks(p_days int default 7, p_genre text default null, p_limit int default 50)
returns table (
  rank int,
  link_preview_id uuid,
  url text,
  platform text,
  kind text,
  title text,
  artist text,
  image_url text,
  post_count int,
  like_count int,
  score int
)
language sql stable security definer set search_path = '' as $$
  with recent as (
    select p.*
    from public.posts p
    where p.created_at > now() - make_interval(days => least(greatest(p_days, 1), 30))
      and (p_genre is null or p.genre = p_genre)
      and not public.is_blocked_with(p.author_id)
  ),
  agg as (
    select link_preview_id,
           count(distinct author_id)::int as post_count,
           coalesce(sum(like_count), 0)::int as like_count
    from recent
    group by link_preview_id
  )
  select
    (row_number() over (order by a.post_count * 3 + a.like_count desc, a.post_count desc, lp.title))::int,
    lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    a.post_count, a.like_count, a.post_count * 3 + a.like_count
  from agg a
  join public.link_previews lp on lp.id = a.link_preview_id
  order by 1
  limit least(greatest(p_limit, 1), 100);
$$;

-------------------------------------------------------------------------------
-- Busca de músicas já compartilhadas no Soundora (título ou artista).
-------------------------------------------------------------------------------
create function public.search_tracks(p_query text, p_limit int default 20)
returns table (
  link_preview_id uuid,
  url text,
  platform text,
  kind text,
  title text,
  artist text,
  image_url text,
  post_count int
)
language sql stable security definer set search_path = public, extensions as $$
  select lp.id, lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
         (select count(*)::int from public.posts p where p.link_preview_id = lp.id and not public.is_blocked_with(p.author_id))
  from public.link_previews lp
  where char_length(trim(p_query)) >= 2
    and exists (select 1 from public.posts p where p.link_preview_id = lp.id)
    and (lp.title % p_query or coalesce(lp.artist, '') % p_query
         or lp.title ilike '%' || p_query || '%' or lp.artist ilike '%' || p_query || '%')
  order by greatest(similarity(lp.title, p_query), similarity(coalesce(lp.artist, ''), p_query)) desc, lp.title
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.discover_cards(int) from public, anon;
revoke execute on function public.discover_swipe(uuid, boolean, uuid) from public, anon;
revoke execute on function public.trending_tracks(int, text, int) from public;
revoke execute on function public.search_tracks(text, int) from public;
grant execute on function public.discover_cards(int) to authenticated;
grant execute on function public.discover_swipe(uuid, boolean, uuid) to authenticated;
grant execute on function public.trending_tracks(int, text, int) to anon, authenticated;
grant execute on function public.search_tracks(text, int) to anon, authenticated;
