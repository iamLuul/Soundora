-- Quem tem vibe ativa? O anel roxo em volta da foto (posts) aparece só para estes autores.
-- Recebe os autores que estão na tela (até 200) e devolve só os que têm uma vibe ativa que eu
-- posso ver: as mesmas regras do vibes_of (sem bloqueio nos dois sentidos e conta privada só
-- se eu sigo). Não diz nada além de "tem vibe ativa" (nem quantas, nem quais).
create function public.authors_with_vibes(p_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id
  from (select distinct unnest(p_ids[1:200]) as id) a
  where auth.uid() is not null
    and exists (select 1 from public.vibes v where v.author_id = a.id and private.vibe_active(v.created_at))
    and not public.content_hidden(a.id);
$$;
revoke execute on function public.authors_with_vibes(uuid[]) from public, anon;
grant execute on function public.authors_with_vibes(uuid[]) to authenticated;
