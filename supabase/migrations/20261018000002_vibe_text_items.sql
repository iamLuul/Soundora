-- Vibes: vários textos na mesma vibe, cada um com lugar, fonte, cor e fundo (como os Stories).
-- text_items é uma lista de até 8 itens { t: texto, x, y: centro em fração da tela, f: fonte,
-- c: cor, b: fundo do texto }. A cor e a fonte são NOMES de uma lista fechada (o app traduz para
-- o desenho): o servidor não guarda cor/fonte livre. Vibes antigas (text, text_x, text_y) continuam
-- valendo: o app mostra como um texto só. O campo text continua guardando o texto (juntos, até 300
-- caracteres) para a moderação e para o tipo "texto", que exige texto.

create function private.vibe_text_items_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  e jsonb;
  k text;
  total int := 0;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 8 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) is distinct from 'object' then
      return false;
    end if;
    for k in select jsonb_object_keys(e) loop
      if k not in ('t', 'x', 'y', 'f', 'c', 'b') then
        return false;
      end if;
    end loop;
    if jsonb_typeof(e -> 't') is distinct from 'string' or char_length(btrim(e ->> 't')) not between 1 and 300 then
      return false;
    end if;
    total := total + char_length(e ->> 't');
    if jsonb_typeof(e -> 'x') is distinct from 'number' or jsonb_typeof(e -> 'y') is distinct from 'number'
       or (e ->> 'x')::numeric not between 0 and 1 or (e ->> 'y')::numeric not between 0 and 1 then
      return false;
    end if;
    if jsonb_typeof(e -> 'f') is distinct from 'string' or (e ->> 'f') not in ('classic', 'modern', 'strong', 'serif', 'typewriter', 'script') then
      return false;
    end if;
    if jsonb_typeof(e -> 'c') is distinct from 'string' or (e ->> 'c') not in ('white', 'black', 'violet', 'blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink') then
      return false;
    end if;
    if jsonb_typeof(e -> 'b') is distinct from 'string' or (e ->> 'b') not in ('none', 'solid', 'soft') then
      return false;
    end if;
  end loop;
  return total <= 600;
end;
$$;
revoke execute on function private.vibe_text_items_ok(jsonb) from public;

alter table public.vibes add column text_items jsonb;
alter table public.vibes add constraint vibes_text_items check (text_items is null or private.vibe_text_items_ok(text_items));

drop function public.vibe_create(text, text, integer, text, text, uuid, uuid, real, real);
drop function public.vibes_of(uuid);

create function public.vibe_create(
  p_kind text,
  p_media_path text default null,
  p_duration_ms integer default null,
  p_text text default null,
  p_style text default 'violet',
  p_link_preview_id uuid default null,
  p_post_id uuid default null,
  p_text_x real default null,
  p_text_y real default null,
  p_text_items jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_post_author uuid;
  v_id uuid;
  v_text text := nullif(btrim(p_text), '');
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'not_authenticated';
  end if;

  -- Vários textos: o campo text guarda os textos juntos (moderação e vibe de texto).
  if p_text_items is not null then
    if not private.vibe_text_items_ok(p_text_items) then
      raise exception 'invalid_text_items';
    end if;
    select left(string_agg(btrim(i ->> 't'), E'\n'), 300) into v_text from jsonb_array_elements(p_text_items) i;
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
    if v_post_author is null or public.content_hidden(v_post_author) then
      raise exception 'not_found';
    end if;
  end if;

  if p_link_preview_id is not null and not exists (select 1 from public.link_previews where id = p_link_preview_id) then
    raise exception 'not_found';
  end if;

  -- Limpa as minhas vibes vencidas (a mídia sai na próxima vez que a Edge Function rodar).
  delete from public.vibes where author_id = v_me and not private.vibe_active(created_at);

  insert into public.vibes (author_id, kind, media_path, duration_ms, text, style, link_preview_id, post_id, text_x, text_y, text_items)
  values (v_me, p_kind, p_media_path, p_duration_ms, v_text, coalesce(p_style, 'violet'), p_link_preview_id, p_post_id,
          -- Posição única só vale para o texto antigo (sem lista); com lista, cada texto tem a sua.
          case when v_text is not null and p_text_items is null then p_text_x end,
          case when v_text is not null and p_text_items is null then p_text_y end,
          p_text_items)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.vibes_of(p_author uuid)
returns table(id uuid, kind text, media_path text, duration_ms integer, text text, style text, created_at timestamptz, seen boolean, view_count integer,
  preview_url text, preview_platform text, preview_title text, preview_artist text, preview_image_url text, post_id uuid, post_body text,
  post_author_username text, post_author_avatar_url text, text_x real, text_y real, preview_audio_url text, text_items jsonb)
language sql stable security definer set search_path = '' as $$
  select
    v.id, v.kind, v.media_path, v.duration_ms, v.text, v.style, v.created_at,
    exists (select 1 from public.vibe_views w where w.vibe_id = v.id and w.viewer_id = auth.uid()),
    -- Quantas pessoas viram: só para o autor.
    case when v.author_id = auth.uid() then (select count(*)::int from public.vibe_views w where w.vibe_id = v.id) end,
    coalesce(lp.url, plp.url), coalesce(lp.platform, plp.platform), coalesce(lp.title, plp.title),
    coalesce(lp.artist, plp.artist), coalesce(lp.image_url, plp.image_url),
    v.post_id, left(sp.body, 200), spa.username, spa.avatar_url,
    v.text_x, v.text_y,
    coalesce(lp.audio_url, plp.audio_url),
    v.text_items
  from public.vibes v
  left join public.link_previews lp on lp.id = v.link_preview_id
  left join public.posts sp on sp.id = v.post_id
  left join public.profiles spa on spa.id = sp.author_id
  left join public.link_previews plp on plp.id = sp.link_preview_id
  where v.author_id = p_author
    and private.vibe_active(v.created_at)
    and not public.content_hidden(v.author_id)
    -- Post compartilhado de alguém com quem eu tenho bloqueio: não aparece.
    and (sp.author_id is null or not public.content_hidden(sp.author_id))
  order by v.created_at, v.id
  limit 100;
$$;

revoke execute on function public.vibe_create(text, text, integer, text, text, uuid, uuid, real, real, jsonb), public.vibes_of(uuid) from public, anon;
grant execute on function public.vibe_create(text, text, integer, text, text, uuid, uuid, real, real, jsonb), public.vibes_of(uuid) to authenticated;
