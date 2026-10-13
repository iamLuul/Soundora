-- Perfil: até 5 músicas favoritas, na ordem que a pessoa escolher.
--
-- - profile_favorite_songs: posição 1 a 5 → cartão de música (link_previews, faixa ou vídeo).
-- - set_favorite_songs(ids): troca a lista inteira de uma vez (a ordem da lista é a ordem).
-- - favorite_songs(pessoa): as favoritas de alguém (nada, se há bloqueio entre as duas).

create table public.profile_favorite_songs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  link_preview_id uuid not null references public.link_previews (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, slot),
  unique (user_id, link_preview_id)
);
alter table public.profile_favorite_songs enable row level security;
revoke all on public.profile_favorite_songs from anon, authenticated;
-- Leitura e escrita só pelas funções abaixo.

create function public.set_favorite_songs(p_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ids uuid[] := coalesce(p_ids, '{}');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if cardinality(ids) > 5 or (select count(distinct x) from unnest(ids) x) <> cardinality(ids) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(ids) x
    where not exists (select 1 from public.link_previews lp where lp.id = x and lp.kind in ('track', 'video'))
  ) then
    raise exception 'favorite_needs_song' using errcode = 'P0001';
  end if;
  if not private.hit(uid, 'favorite_songs', 60, interval '1 hour') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  delete from public.profile_favorite_songs where user_id = uid;
  insert into public.profile_favorite_songs (user_id, slot, link_preview_id)
  select uid, t.ord::smallint, t.id from unnest(ids) with ordinality as t(id, ord);
end;
$$;
revoke execute on function public.set_favorite_songs(uuid[]) from public, anon;
grant execute on function public.set_favorite_songs(uuid[]) to authenticated;

create function public.favorite_songs(p_user uuid)
returns table (
  slot int,
  link_preview_id uuid,
  title text,
  artist text,
  image_url text,
  url text,
  platform text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.is_blocked_with(p_user) then
    return;
  end if;
  return query
  select f.slot::int, lp.id, lp.title, lp.artist, lp.image_url, lp.url, lp.platform
  from public.profile_favorite_songs f
  join public.link_previews lp on lp.id = f.link_preview_id
  where f.user_id = p_user
  order by f.slot;
end;
$$;
revoke execute on function public.favorite_songs(uuid) from public, anon;
grant execute on function public.favorite_songs(uuid) to authenticated;
