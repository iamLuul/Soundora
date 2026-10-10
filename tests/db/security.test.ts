// Regras de segurança que valem para o banco inteiro, inclusive para tabelas e funções
// que ainda vão ser criadas: se alguém esquecer o RLS numa tabela nova, este teste falha.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let dani: string;
let edu: string;

beforeAll(async () => {
  db = await connect();
  dani = await createUser(db, 'dani');
  edu = await createUser(db, 'edu');
});
afterAll(async () => db.close());

describe('invariantes do banco', () => {
  it('toda tabela do schema public tem RLS ligado', async () => {
    const rows = await db.sql<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it('visitante sem login (anon) não tem acesso a nenhuma tabela', async () => {
    const rows = await db.sql<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
         and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
           or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`,
    );
    expect(rows).toEqual([]);
  });

  it('visitante sem login não chama nenhuma função', async () => {
    const rows = await db.sql<{ fn: string }>(
      `select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(rows).toEqual([]);
  });

  it('o app não apaga tabelas inteiras (TRUNCATE ignora o RLS) nem cria triggers', async () => {
    const rows = await db.sql<{ table: string }>(
      `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and (has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'trigger')
           or has_table_privilege('authenticated', c.oid, 'references'))`,
    );
    expect(rows).toEqual([]);
  });

  it('nenhuma policy vale para visitantes', async () => {
    const rows = await db.sql<{ policy: string }>(
      `select tablename || ': ' || policyname as policy from pg_policies
       where schemaname = 'public' and (roles @> array['public']::name[] or roles @> array['anon']::name[])`,
    );
    expect(rows).toEqual([]);
  });

  it('funções com privilégio de dono fixam o search_path (contra sequestro de funções)', async () => {
    const rows = await db.sql<{ fn: string }>(
      `select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows).toEqual([]);
  });

  it('funções só do servidor ficam fechadas para o app', async () => {
    for (const fn of [
      `select * from public.login_lookup('dani')`,
      `select public.login_attempts_recent('dani', 'password', 15, true)`,
      `select public.rate_limit_hit('${dani}', 'x', 1, 60)`,
    ]) {
      await expect(db.as(dani, fn)).rejects.toThrow(/permission denied/);
    }
  });

  it('o schema private é invisível para o app', async () => {
    await expect(db.as(dani, `select * from private.rate_events`)).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from private.rate_events`)).rejects.toThrow(/permission denied/);
  });

  it('consultas do app têm tempo máximo', async () => {
    const rows = await db.sql<{ role: string; config: string[] }>(
      `select rolname as role, rolconfig as config from pg_roles where rolname in ('anon', 'authenticated') order by rolname`,
    );
    expect(rows).toEqual([
      { role: 'anon', config: ['statement_timeout=3s'] },
      { role: 'authenticated', config: ['statement_timeout=8s'] },
    ]);
  });

  it('tabelas e funções novas nascem fechadas', async () => {
    await db.sql(`create table public.tabela_nova_teste (id int)`);
    await db.sql(`create function public.funcao_nova_teste() returns int language sql as 'select 1'`);
    try {
      const [t] = await db.sql<{ anon: boolean; trunc: boolean }>(
        `select has_table_privilege('anon', 'public.tabela_nova_teste', 'select') as anon,
                has_table_privilege('authenticated', 'public.tabela_nova_teste', 'truncate') as trunc`,
      );
      expect(t).toEqual({ anon: false, trunc: false });
      const [f] = await db.sql<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', 'public.funcao_nova_teste()', 'execute') as anon,
                has_function_privilege('authenticated', 'public.funcao_nova_teste()', 'execute') as auth`,
      );
      expect(f).toEqual({ anon: false, auth: false });
    } finally {
      await db.sql(`drop table public.tabela_nova_teste; drop function public.funcao_nova_teste()`);
    }
  });
});

describe('limite de ações por pessoa', () => {
  it('no máximo 30 posts por hora', async () => {
    const p = await createPreview(db, 'https://open.spotify.com/track/limite');
    for (let i = 0; i < 30; i++) {
      await db.as(edu, `insert into public.posts (author_id, body, link_preview_id) values ($1, $2, $3)`, [edu, `post ${i}`, p]);
    }
    await expect(
      db.as(edu, `insert into public.posts (author_id, body, link_preview_id) values ($1, 'mais um', $2)`, [edu, p]),
    ).rejects.toThrow(/rate_limited/);
    // O limite é por pessoa: outra pessoa continua postando.
    await db.as(dani, `insert into public.posts (author_id, body, link_preview_id) values ($1, 'oi', $2)`, [dani, p]);
  });

  it('o servidor (sem pessoa logada) não é limitado', async () => {
    const [{ ok }] = (await db.sql<{ ok: boolean }>(`select private.hit($1, 'teste', 1, interval '1 hour') as ok`, [dani])) as [{ ok: boolean }];
    expect(ok).toBe(true);
    const [{ ok: again }] = (await db.sql<{ ok: boolean }>(`select private.hit($1, 'teste', 1, interval '1 hour') as ok`, [dani])) as [{ ok: boolean }];
    expect(again).toBe(false);
  });
});

describe('storage: bucket de avatares', () => {
  it('limite de 1 MB e só imagens', async () => {
    const [b] = await db.sql(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`);
    expect(b).toEqual({ public: true, file_size_limit: '1048576', allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] });
  });

  it('o app não envia, troca, apaga nem lista arquivos (só a Edge Function upload-avatar)', async () => {
    await expect(
      db.as(dani, `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)`, [`${dani}/avatar-1.jpg`, dani]),
    ).rejects.toThrow(/row-level security/);
    await db.sql(`insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)`, [`${dani}/avatar-2.jpg`, dani]);
    expect(await db.as(dani, `select name from storage.objects where bucket_id = 'avatars'`)).toEqual([]);
    expect(await db.as(dani, `delete from storage.objects where bucket_id = 'avatars' returning name`)).toEqual([]);
    expect(await db.anon(`select name from storage.objects`)).toEqual([]);
  });
});
