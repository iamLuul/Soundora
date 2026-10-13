-- Limite de ações: além de "rate_limited", o erro diz em quantos segundos dá para tentar de
-- novo (DETAIL = segundos), e o app mostra "Tente de novo em X minutos" em vez de "espere um
-- pouco". O tempo é quando a ação mais antiga da janela sai dela e libera uma vaga.

create function private.retry_after(p_user uuid, p_action text, p_window interval)
returns int
language sql stable security definer set search_path = '' as $$
  select greatest(1, ceil(extract(epoch from (min(e.created_at) + p_window - now())))::int)
  from private.rate_events e
  where e.user_id = p_user and e.action = p_action and e.created_at >= now() - p_window;
$$;
revoke execute on function private.retry_after(uuid, text, interval) from public;

create or replace function private.tg_rate_limit()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result record := case when tg_op = 'DELETE' then old else new end;
begin
  -- Sem pessoa logada = servidor (chave secreta) ou manutenção: sem limite.
  if uid is null then
    return result;
  end if;
  if not private.hit(uid, tg_argv[0], tg_argv[1]::int, tg_argv[2]::interval) then
    raise exception 'rate_limited'
      using hint = tg_argv[0],
            detail = coalesce(private.retry_after(uid, tg_argv[0], tg_argv[2]::interval), 60)::text;
  end if;
  return result;
end;
$$;
revoke execute on function private.tg_rate_limit() from public;

-- Músicas favoritas usam o limite direto (sem trigger): mesmo detalhe.
create or replace function public.set_favorite_songs(p_ids uuid[])
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
    raise exception 'rate_limited'
      using errcode = 'P0001', detail = coalesce(private.retry_after(uid, 'favorite_songs', interval '1 hour'), 60)::text;
  end if;
  delete from public.profile_favorite_songs where user_id = uid;
  insert into public.profile_favorite_songs (user_id, slot, link_preview_id)
  select uid, t.ord::smallint, t.id from unnest(ids) with ordinality as t(id, ord);
end;
$$;
