-- Prévia de 30 s da música (oficial da Apple Music ou da Deezer), tocada de fundo nas Vibes.
--
-- O Soundora não guarda nem serve o áudio: guarda só o endereço da prévia que a própria loja
-- oferece para divulgação, e o app toca direto do servidor dela, sempre com o botão
-- "Ouvir no ..." levando para a música completa.

alter table public.link_previews add column audio_url text
  check (audio_url is null or audio_url ~ '^https://([a-z0-9-]+\.)*(mzstatic\.com|itunes\.apple\.com|dzcdn\.net)/');
-- Quando as lojas foram consultadas (null = ainda não; a Edge Function consulta e completa).
alter table public.link_previews add column store_checked_at timestamptz;

drop function public.vibes_of(uuid);

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
  text_y real,
  preview_audio_url text
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
    v.text_x, v.text_y,
    coalesce(lp.audio_url, plp.audio_url)
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


grant execute on function public.vibes_of(uuid) to authenticated;
