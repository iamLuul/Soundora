-- Selos do perfil: só para exibir (não dão vantagem nenhuma no app).
--
-- - badges: o catálogo. Cada selo tem nome e descrição (pt e en), o desenho (icon, que o app
--   conhece) e como é entregue: 'manual' (a equipe concede pelo Painel admin) ou 'auto' (regras
--   do sistema no futuro: seguidores, reviews, dias ativos...; o admin não concede esses).
-- - Disponibilidade: grants_open pausa e reabre a entrega. available_until encerra o selo numa
--   data: depois dela ninguém mais recebe, nem pelo admin, e a data não pode mais ser mudada
--   (selo limitado). Quem já tem continua tendo.
-- - user_badges: quem tem qual selo e desde quando. A regra de disponibilidade fica num trigger
--   da tabela, então vale para qualquer caminho de escrita (inclusive SQL do painel da nuvem).
-- - Nada é lido ou escrito direto pelo app: só pelas funções abaixo.

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,40}$'),
  icon text not null check (icon ~ '^[a-z0-9_]{2,40}$'),
  name_pt text not null check (char_length(name_pt) between 1 and 40),
  name_en text not null check (char_length(name_en) between 1 and 40),
  description_pt text not null check (char_length(description_pt) between 1 and 200),
  description_en text not null check (char_length(description_en) between 1 and 200),
  award text not null default 'manual' check (award in ('manual', 'auto')),
  position int not null default 100,
  grants_open boolean not null default true,
  available_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, badge_id)
);
create index user_badges_badge on public.user_badges (badge_id, granted_at desc);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
revoke all on public.badges, public.user_badges from anon, authenticated;

-- O selo ainda pode ser entregue agora?
create function private.badge_grantable(p_open boolean, p_until timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_open and (p_until is null or p_until > now());
$$;
revoke execute on function private.badge_grantable(boolean, timestamptz) from public;

-- Selo encerrado (data já passou) não muda mais a data nem reabre.
create function private.tg_badge_retired() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.available_until is not null and old.available_until <= now() then
    if new.available_until is distinct from old.available_until or (new.grants_open and not old.grants_open) then
      raise exception 'badge_retired' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger badge_retired before update on public.badges for each row execute function private.tg_badge_retired();

-- Só entra selo que está disponível agora.
create function private.tg_user_badge_grantable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.badges b where b.id = new.badge_id and private.badge_grantable(b.grants_open, b.available_until)) then
    raise exception 'badge_unavailable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger user_badge_grantable before insert on public.user_badges for each row execute function private.tg_user_badge_grantable();

-- ---------------------------------------------------------------- perfil

-- Selos de uma pessoa, com o texto nos dois idiomas (o app escolhe). Quem tem bloqueio com a
-- pessoa não vê (como as músicas favoritas). `limited` = não dá mais para receber.
create function public.profile_badges(p_user uuid)
returns table (
  slug text, icon text, name_pt text, name_en text, description_pt text, description_en text, granted_at timestamptz, limited boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if public.is_blocked_with(p_user) then
    return;
  end if;
  return query
  select b.slug, b.icon, b.name_pt, b.name_en, b.description_pt, b.description_en, ub.granted_at,
         not private.badge_grantable(b.grants_open, b.available_until)
  from public.user_badges ub
  join public.badges b on b.id = ub.badge_id
  where ub.user_id = p_user
  order by b.position, ub.granted_at
  limit 50;
end;
$$;
revoke execute on function public.profile_badges(uuid) from public, anon;
grant execute on function public.profile_badges(uuid) to authenticated;

-- ---------------------------------------------------------------- painel admin

alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check
  check (action in ('dismiss', 'remove', 'verify', 'unverify', 'suspend', 'unsuspend', 'badge_grant', 'badge_revoke', 'badge_open', 'badge_pause', 'badge_until'));
alter table public.admin_actions drop constraint admin_actions_target_type_check;
alter table public.admin_actions add constraint admin_actions_target_type_check
  check (target_type in ('post', 'comment', 'profile', 'vibe', 'review', 'badge'));

create function public.admin_badges()
returns table (
  id uuid, slug text, icon text, name_pt text, name_en text, description_pt text, description_en text, award text,
  grants_open boolean, available_until timestamptz, grantable boolean, retired boolean, holders int
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select b.id, b.slug, b.icon, b.name_pt, b.name_en, b.description_pt, b.description_en, b.award,
         b.grants_open, b.available_until,
         private.badge_grantable(b.grants_open, b.available_until),
         b.available_until is not null and b.available_until <= now(),
         (select count(*)::int from public.user_badges ub where ub.badge_id = b.id)
  from public.badges b
  order by b.position, b.created_at;
end;
$$;

create function public.admin_badge_holders(p_badge uuid, p_limit int default 100)
returns table (user_id uuid, username text, display_name text, avatar_url text, granted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_admin();
  return query
  select p.id, p.username, p.display_name, p.avatar_url, ub.granted_at
  from public.user_badges ub
  join public.profiles p on p.id = ub.user_id
  where ub.badge_id = p_badge
  order by ub.granted_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Concede pelo @ (sem o "@"). Só selos manuais e disponíveis; repetir não faz nada.
create function public.admin_grant_badge(p_badge uuid, p_username text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_award text;
begin
  perform private.require_admin();
  select b.award into v_award from public.badges b where b.id = p_badge;
  if v_award is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_award <> 'manual' then raise exception 'badge_not_manual' using errcode = 'P0001'; end if;
  select p.id into v_user from public.profiles p where p.username = lower(trim(both '@ ' from coalesce(p_username, '')));
  if v_user is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  insert into public.user_badges (user_id, badge_id, granted_by) values (v_user, p_badge, auth.uid())
  on conflict (user_id, badge_id) do nothing;
  if found then perform private.log_admin('badge_grant', 'profile', v_user, jsonb_build_object('badge', p_badge)); end if;
end;
$$;

create function public.admin_revoke_badge(p_badge uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.user_badges where badge_id = p_badge and user_id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.log_admin('badge_revoke', 'profile', p_user, jsonb_build_object('badge', p_badge));
end;
$$;

-- Pausa (false) ou reabre (true) a entrega. Selo encerrado não reabre (trigger).
create function public.admin_set_badge_open(p_badge uuid, p_open boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.badges set grants_open = coalesce(p_open, false) where id = p_badge;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.log_admin(case when p_open then 'badge_open' else 'badge_pause' end, 'badge', p_badge);
end;
$$;

-- Data em que o selo se encerra (agora = encerrar já). null tira a data, se ainda não passou.
-- Depois da data, o selo fica limitado para sempre (trigger).
create function public.admin_set_badge_until(p_badge uuid, p_until timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.badges set available_until = case when p_until is not null and p_until < now() then now() else p_until end where id = p_badge;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform private.log_admin('badge_until', 'badge', p_badge, jsonb_build_object('until', p_until));
end;
$$;

revoke execute on function
  public.admin_badges(),
  public.admin_badge_holders(uuid, int),
  public.admin_grant_badge(uuid, text),
  public.admin_revoke_badge(uuid, uuid),
  public.admin_set_badge_open(uuid, boolean),
  public.admin_set_badge_until(uuid, timestamptz)
from public, anon;
grant execute on function
  public.admin_badges(),
  public.admin_badge_holders(uuid, int),
  public.admin_grant_badge(uuid, text),
  public.admin_revoke_badge(uuid, uuid),
  public.admin_set_badge_open(uuid, boolean),
  public.admin_set_badge_until(uuid, timestamptz)
to authenticated;

-- ---------------------------------------------------------------- apoio (Patreon)

-- Link da página de apoio, mostrado só na versão Web. Só a equipe muda (pelo banco); só aceita
-- endereço do Patreon com https. Sem link, o botão não aparece.
alter table public.app_config
  add column support_url text check (support_url is null or support_url ~ '^https://(www\.)?patreon\.com/[A-Za-z0-9_./?=&%-]{1,200}$');

-- ---------------------------------------------------------------- primeiro selo

insert into public.badges (slug, icon, name_pt, name_en, description_pt, description_en, award, position)
values (
  'early_supporter', 'early_supporter', 'Contribuidor inicial', 'Early supporter',
  'Apoiou o Soundhora no começo, quando a rede ainda estava sendo construída.',
  'Supported Soundhora at the very beginning, while the network was still being built.',
  'manual', 1
);
