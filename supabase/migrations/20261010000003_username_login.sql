-- Login por @usuário.
-- O app nunca recebe o e-mail de outra pessoa: a troca usuário → e-mail acontece só no
-- servidor (Edge Function auth-username, com a chave secreta), e as tentativas são limitadas.

-- Devolve o id e o e-mail da conta dona do username. Só a service role pode chamar.
create function public.login_lookup(p_username text)
returns table (user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(trim(p_username));
$$;

revoke execute on function public.login_lookup(text) from public, anon, authenticated;
grant execute on function public.login_lookup(text) to service_role;

-- Tentativas de login por username, para bloquear quem fica chutando senha ou código.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  username text not null,
  kind text not null check (kind in ('password', 'send_code', 'verify_code')),
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_recent on public.login_attempts (username, kind, created_at desc);

-- RLS ligado e nenhuma policy: o app não lê nem escreve; só a Edge Function (service role).
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

-- Quantas tentativas recentes (falhas, ou todas) um username teve de um tipo.
create function public.login_attempts_recent(p_username text, p_kind text, p_minutes int, p_failures_only boolean)
returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.login_attempts
  where username = lower(trim(p_username))
    and kind = p_kind
    and created_at > now() - make_interval(mins => p_minutes)
    and (not p_failures_only or not success);
$$;

revoke execute on function public.login_attempts_recent(text, text, int, boolean) from public, anon, authenticated;
grant execute on function public.login_attempts_recent(text, text, int, boolean) to service_role;
