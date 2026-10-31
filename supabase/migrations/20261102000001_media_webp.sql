-- Fotos em WebP: o app passa a converter as fotos de posts e vibes para WebP (bem menor que JPEG
-- na mesma qualidade). JPEG continua aceito (navegador que não gera WebP e as fotos antigas).
-- A Edge Function media-upload continua sendo a única que grava, conferindo os bytes.

-- Tira as regras antigas que só aceitavam ".jpg" (o nome que o Postgres deu a elas pode variar).
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where conrelid in ('public.vibes'::regclass, 'public.post_media'::regclass)
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%jpg%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.vibes add constraint vibes_media_path_format
  check (media_path is null or media_path ~ ('^' || author_id::text || '/[0-9a-f-]{36}\.(jpg|webp|mp4)$'));

alter table public.vibes add constraint vibes_kind_fields check (coalesce(case kind
  when 'photo' then media_path ~ '\.(jpg|webp)$' and post_id is null and link_preview_id is null
  when 'video' then media_path ~ '\.mp4$' and duration_ms is not null and post_id is null and link_preview_id is null
  when 'text' then media_path is null and char_length(btrim(coalesce(text, ''))) > 0 and post_id is null and link_preview_id is null
  when 'post' then media_path is null and post_id is not null and link_preview_id is null
end, false));

alter table public.post_media add constraint post_media_kind_path check (
  (kind = 'photo' and path ~ '\.(jpg|webp)$' and duration_ms is null)
  or (kind = 'video' and path ~ '\.mp4$' and duration_ms is not null)
);

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets set allowed_mime_types = array['image/webp', 'image/jpeg', 'video/mp4']
    where id in ('vibes', 'post-media');
  end if;
end $$;
