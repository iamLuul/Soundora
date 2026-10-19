-- content_hidden mais rápida. Ela roda uma vez por post em quase toda leitura (feed, perfil,
-- busca, Descobrir, contadores e as policies de posts, curtidas e comentários), então o custo
-- por chamada vira o custo da tela. A versão antiga chamava is_blocked_with e avaliava
-- auth.uid() várias vezes: ~120 µs por linha (600 ms para 5.000 posts). Esta lê o auth.uid()
-- uma vez, sai cedo no caso comum e faz só buscas por chave: ~15 µs por linha.
-- Mesma regra: o autor sou eu → visível; bloqueio nos dois sentidos, ou conta privada que
-- eu não sigo → escondido.

create or replace function public.content_hidden(p_author uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if p_author = me then
    return false;
  end if;
  if exists (select 1 from public.blocks b where b.blocker_id = me and b.blocked_id = p_author)
     or exists (select 1 from public.blocks b where b.blocker_id = p_author and b.blocked_id = me) then
    return true;
  end if;
  return exists (
    select 1 from public.profiles pr
    where pr.id = p_author and pr.is_private
      and not exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = p_author)
  );
end;
$$;
