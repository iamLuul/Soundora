-- Imita o mínimo do Supabase num PostgreSQL comum, para testar migrations e
-- RLS sem Docker (no CI e na sua máquina). No Supabase de verdade, nada disto
-- é aplicado: o próprio Supabase já cria auth.users, auth.uid() e os papéis.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Mesmos privilégios padrão que o Supabase dá ao schema public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant usage on types to anon, authenticated, service_role;

-- Storage: só o necessário para testar as regras do bucket de avatares.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
-- O Supabase dá estes privilégios; quem decide são as policies de RLS.
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Realtime: a tabela de mensagens do Broadcast, realtime.send() e realtime.topic().
-- No Supabase, o servidor do Realtime lê realtime.messages com o RLS de quem está ouvindo,
-- com o canal em realtime.topic(); aqui o teste define o canal com set_config.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text
language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$
  insert into realtime.messages (payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast')
$$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;
grant execute on function realtime.topic() to anon, authenticated, service_role;
