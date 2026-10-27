-- Vibes no jeito dos Stories:
--
-- 1. Música em qualquer vibe: foto, vídeo e texto podem levar uma música (aparece como um
--    selo em cima, como a música do Story). A vibe "música" (o cartão grande no fundo colorido)
--    continua igual. Post compartilhado continua sem música extra (o post já tem a dele).
-- 2. Textos com tamanho (s: 0,3 a 4 vezes), giro (r: -180 a 180 graus) e alinhamento
--    (a: left, center ou right). Os três são opcionais: textos antigos continuam valendo.

-- ---------------------------------------------------------------- 1. música em qualquer vibe

do $$
declare
  c text;
begin
  -- A regra de campos por tipo foi criada sem nome: acha pelo texto dela.
  select conname into c
  from pg_constraint
  where conrelid = 'public.vibes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%''photo''%''video''%''text''%';
  if c is not null then
    execute format('alter table public.vibes drop constraint %I', c);
  end if;
end;
$$;

alter table public.vibes add constraint vibes_kind_fields check (coalesce(case kind
  when 'photo' then media_path ~ '\.jpg$' and post_id is null
  when 'video' then media_path ~ '\.mp4$' and duration_ms is not null and post_id is null
  when 'text' then media_path is null and char_length(btrim(coalesce(text, ''))) > 0 and post_id is null
  when 'music' then media_path is null and link_preview_id is not null and post_id is null
  when 'post' then media_path is null and post_id is not null and link_preview_id is null
end, false));

-- ---------------------------------------------------------------- 2. tamanho, giro e alinhamento

create or replace function private.vibe_text_items_ok(p jsonb) returns boolean
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
      if k not in ('t', 'x', 'y', 'f', 'c', 'b', 's', 'r', 'a') then
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
    -- Novos e opcionais: tamanho, giro e alinhamento.
    if e ? 's' and (jsonb_typeof(e -> 's') is distinct from 'number' or (e ->> 's')::numeric not between 0.3 and 4) then
      return false;
    end if;
    if e ? 'r' and (jsonb_typeof(e -> 'r') is distinct from 'number' or (e ->> 'r')::numeric not between -180 and 180) then
      return false;
    end if;
    if e ? 'a' and (jsonb_typeof(e -> 'a') is distinct from 'string' or (e ->> 'a') not in ('left', 'center', 'right')) then
      return false;
    end if;
  end loop;
  return total <= 600;
end;
$$;
revoke execute on function private.vibe_text_items_ok(jsonb) from public;
