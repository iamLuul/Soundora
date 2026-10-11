-- Vibes: o texto fica onde a pessoa tocou na tela (e pode ser arrastado), não preso embaixo.
-- text_x/text_y = centro do texto em fração da tela (0 = esquerda/topo, 1 = direita/base).
-- Nulo = lugar padrão do tipo (embaixo na foto/vídeo, no meio no texto).

alter table public.vibes add column text_x real check (text_x between 0 and 1);
alter table public.vibes add column text_y real check (text_y between 0 and 1);
alter table public.vibes add constraint vibes_text_position check ((text_x is null) = (text_y is null));

drop function public.vibe_create(text, text, int, text, text, uuid, uuid);
drop function public.vibes_of(uuid);

create function public.vibe_create(
  p_kind text,
  p_media_path text default null,
  p_duration_ms int default null,
  p_text text default null,
  p_style text default 'violet',
  p_link_preview_id uuid default null,
  p_post_id uuid default null,
  p_text_x real default null,
  p_text_y real default null
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

  insert into public.vibes (author_id, kind, media_path, duration_ms, text, style, link_preview_id, post_id, text_x, text_y)
  values (v_me, p_kind, p_media_path, p_duration_ms, nullif(btrim(p_text), ''), coalesce(p_style, 'violet'), p_link_preview_id, p_post_id,
          -- Posição só faz sentido com texto; sem ela, o app usa o lugar padrão do tipo.
          case when nullif(btrim(p_text), '') is not null then p_text_x end,
          case when nullif(btrim(p_text), '') is not null then p_text_y end)
  returning id into v_id;
  return v_id;
end;
$$;


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
  post_author_avatar_url text,
  text_x real,
  text_y real
)
language sql stable security definer set search_path = '' as $$
  select
    v.id, v.kind, v.media_path, v.duration_ms, v.text, v.style, v.created_at,
    exists (select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()),
    -- Quantas pessoas viram: só para o autor.
    case when v.author_id = auth.uid() then (select count(*)::int from public.vibe_views w where w.vibe_id = v.id) end,
    coalesce(lp.url, plp.url), coalesce(lp.platform, plp.platform), coalesce(lp.title, plp.title),
    coalesce(lp.artist, plp.artist), coalesce(lp.image_url, plp.image_url),
    v.post_id, left(sp.body, 200), spa.username, spa.avatar_url,
    v.text_x, v.text_y
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


grant execute on function
  public.vibe_create(text, text, int, text, text, uuid, uuid, real, real),
  public.vibes_of(uuid)
to authenticated;
