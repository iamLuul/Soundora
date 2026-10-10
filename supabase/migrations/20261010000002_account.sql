-- Conta: checar username na hora e proteger a foto de perfil.

-- true se o username tem formato válido e ninguém usa. Usada no onboarding enquanto a pessoa digita.
create function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_.]{3,20}$'
     and lower(trim(p_username)) !~ '^\.|\.$|\.\.'
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)));
$$;

revoke execute on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- A foto de perfil só pode apontar para a pasta da própria pessoa no bucket "avatars".
-- Assim ninguém usa imagem de terceiros nem de outro site como avatar.
alter table public.profiles add constraint profiles_avatar_url_own_folder
  check (avatar_url is null or avatar_url like '%/storage/v1/object/public/avatars/' || id::text || '/%');
