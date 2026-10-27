-- Vibes sem música: o Soundhora não tem direito de pôr músicas nas vibes. Nenhuma vibe pode
-- mais ser do tipo "música" nem levar uma música por cima (foto, vídeo ou texto).
-- O post compartilhado continua igual: ele mostra o post (com o link que o autor colou), sem tocar
-- nada.

-- Vibes duram 24 h; as de música que ainda estão no ar saem, e as outras perdem a música.
delete from public.vibes where kind = 'music';
update public.vibes set link_preview_id = null where kind in ('photo', 'video', 'text') and link_preview_id is not null;

alter table public.vibes drop constraint if exists vibes_kind_fields;
alter table public.vibes add constraint vibes_kind_fields check (coalesce(case kind
  when 'photo' then media_path ~ '\.jpg$' and post_id is null and link_preview_id is null
  when 'video' then media_path ~ '\.mp4$' and duration_ms is not null and post_id is null and link_preview_id is null
  when 'text' then media_path is null and char_length(btrim(coalesce(text, ''))) > 0 and post_id is null and link_preview_id is null
  when 'post' then media_path is null and post_id is not null and link_preview_id is null
  -- 'music' (e qualquer outro) não entra mais.
end, false));
