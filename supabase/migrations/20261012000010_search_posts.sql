-- Buscar › posts com a palavra: quando o texto não é pessoa, música nem gênero, ao apertar
-- "pesquisar" o app mostra os posts cujo texto contém a palavra (sem diferenciar maiúsculas
-- nem acentos: "incrivel" acha "Incrível"),
-- do mais novo ao mais velho, sem quem bloqueei ou me bloqueou. Só com login.

-- Minúsculas e sem acento (imutável, para poder ter índice).
create function private.fold(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select translate(lower(p), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;
-- Inofensiva, e quem posta precisa dela (o índice usa a função ao gravar).
revoke execute on function private.fold(text) from public;
grant execute on function private.fold(text) to authenticated, service_role;

create index if not exists posts_body_fold_trgm on public.posts using gin (private.fold(body) extensions.gin_trgm_ops);

create function public.search_posts(p_query text, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_item
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := private.fold(btrim(coalesce(p_query, '')));
  pattern text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(q) < 2 or char_length(q) > 100 then
    return;
  end if;
  -- % e _ digitados valem como letra, não como curinga.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select
    p.id, p.body, p.genre, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()) as liked_by_me,
    a.id, a.username, a.display_name, a.avatar_url,
    lp.url, lp.platform, lp.kind, lp.title, lp.artist, lp.image_url,
    null::float8,
    p.genres, private.post_media_json(p.id), p.type
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.link_previews lp on lp.id = p.link_preview_id
  where private.fold(p.body) like pattern escape '\'
    and not public.is_blocked_with(p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

revoke execute on function public.search_posts(text, timestamptz, uuid, int) from public, anon;
grant execute on function public.search_posts(text, timestamptz, uuid, int) to authenticated;
