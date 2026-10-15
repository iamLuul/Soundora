import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export const ROOT = join(import.meta.dirname, '..', '..');
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/postgres';
const TEST_DB = 'soundhora_test';

function urlFor(db: string): string {
  const u = new URL(DATABASE_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

/** Recria o banco de teste e aplica: shim do Supabase → migrations → seed. */
export async function resetDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const db = new pg.Client({ connectionString: urlFor(TEST_DB) });
  await db.connect();
  try {
    await db.query(readFileSync(join(ROOT, 'tests/db/supabase-shim.sql'), 'utf8'));
    const dir = join(ROOT, 'supabase/migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      try {
        await db.query(readFileSync(join(dir, file), 'utf8'));
      } catch (err) {
        throw new Error(`migration ${file} falhou: ${(err as Error).message}`);
      }
    }
    await db.query(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'));
  } finally {
    await db.end();
  }
}

export interface Db {
  /** Roda como superusuário (para preparar dados). */
  sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  /** Roda como um usuário logado (papel authenticated + JWT com sub). */
  as<T extends pg.QueryResultRow = pg.QueryResultRow>(userId: string, text: string, params?: unknown[]): Promise<T[]>;
  /** Roda como visitante sem login (papel anon). */
  anon<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function connect(): Promise<Db> {
  const client = new pg.Client({ connectionString: urlFor(TEST_DB) });
  await client.connect();

  async function inRole<T extends pg.QueryResultRow>(role: string, sub: string | null, text: string, params?: unknown[]) {
    await client.query('begin');
    try {
      await client.query(`set local role ${role}`);
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
      const res = await client.query<T>(text, params);
      await client.query('commit');
      return res.rows;
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }

  return {
    sql: async (text, params) => (await client.query(text, params)).rows,
    as: (userId, text, params) => inRole('authenticated', userId, text, params),
    anon: (text, params) => inRole('anon', null, text, params),
    close: () => client.end(),
  };
}

/** Cria um usuário em auth.users e, se pedido, completa o onboarding. */
export async function createUser(
  db: Db,
  username: string,
  opts: { birthdate?: string; genres?: string[]; onboard?: boolean } = {},
): Promise<string> {
  const [row] = await db.sql<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [`${username}@teste.dev`]);
  const id = row!.id;
  if (opts.onboard !== false) {
    await db.as(id, `select public.complete_onboarding($1, $2, $3::date, $4::text[], 'pt-BR')`, [
      username,
      username.toUpperCase(),
      opts.birthdate ?? '1995-05-10',
      opts.genres ?? ['indie', 'rock', 'lo_fi'],
    ]);
  }
  return id;
}

/** Cria um cartão de prévia como a Edge Function faria (service role). */
export async function createPreview(db: Db, url: string, title = 'Faixa'): Promise<string> {
  const [row] = await db.sql<{ id: string }>(
    `insert into public.link_previews (url, platform, kind, title, artist) values ($1, 'spotify', 'track', $2, 'Artista')
     on conflict (url) do update set title = excluded.title returning id`,
    [url, title],
  );
  return row!.id;
}
