-- Um @ é sempre de um só: de um usuário OU de uma comunidade, nunca dos dois.
--
-- A tabela handles guarda todos os @ em uso (chave primária = o @), mantida por triggers no
-- perfil (cadastro, troca de @, conta apagada) e na comunidade (criada, apagada). A chave
-- primária garante a regra mesmo com dois cadastros ao mesmo tempo.
-- Comunidades criadas antes desta regra com o mesmo @ de alguém continuam como estão (o @ fica
-- com o usuário); daqui para frente não acontece mais.

create table public.handles (
  handle text primary key,
  kind text not null check (kind in ('user', 'community')),
  owner_id uuid not null
);
create index handles_owner on public.handles (owner_id);
alter table public.handles enable row level security;
revoke all on public.handles from anon, authenticated;

insert into public.handles (handle, kind, owner_id)
select username, 'user', id from public.profiles
on conflict do nothing;
insert into public.handles (handle, kind, owner_id)
select slug, 'community', id from public.communities
on conflict do nothing;

-- Perfil: reserva o @ no cadastro e na troca (libera o antigo); apaga junto com a conta.
create function private.tg_profile_handle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.handles where owner_id = old.id and kind = 'user';
    return old;
  end if;
  if tg_op = 'UPDATE' and new.username = old.username then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    delete from public.handles where handle = old.username and owner_id = old.id;
  end if;
  insert into public.handles (handle, kind, owner_id) values (new.username, 'user', new.id)
  on conflict do nothing;
  if not found then
    raise exception 'username_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_profile_handle() from public;
create trigger handle before insert or update of username on public.profiles
  for each row execute function private.tg_profile_handle();
create trigger handle_delete after delete on public.profiles
  for each row execute function private.tg_profile_handle();

-- Comunidade: o @ não muda depois de criada.
create function private.tg_community_handle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.handles where owner_id = old.id and kind = 'community';
    return old;
  end if;
  insert into public.handles (handle, kind, owner_id) values (new.slug, 'community', new.id)
  on conflict do nothing;
  if not found then
    raise exception 'community_slug_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.tg_community_handle() from public;
create trigger handle before insert on public.communities
  for each row execute function private.tg_community_handle();
create trigger handle_delete after delete on public.communities
  for each row execute function private.tg_community_handle();

-- "Esse @ está livre?" (cadastro e troca de @): agora também olha as comunidades.
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_.]{3,20}$'
     and lower(trim(p_username)) !~ '^\.|\.$|\.\.'
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)))
     and not exists (select 1 from public.handles where handle = lower(trim(p_username)));
$$;

-- E o @ de comunidade (tela de criar).
create function public.community_slug_available(p_slug text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and lower(trim(p_slug)) ~ '^[a-z0-9_]{3,30}$'
     and not exists (select 1 from public.handles where handle = lower(trim(p_slug)));
$$;
revoke execute on function public.community_slug_available(text) from public, anon;
grant execute on function public.community_slug_available(text) to authenticated;
