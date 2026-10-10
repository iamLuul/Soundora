import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let carla: string;

/** Roda como a Edge Function (papel service_role). */
async function asService<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.sql('begin');
  try {
    await db.sql('set local role service_role');
    const rows = await db.sql<T>(sql, params);
    await db.sql('commit');
    return rows;
  } catch (err) {
    await db.sql('rollback');
    throw err;
  }
}

beforeAll(async () => {
  db = await connect();
  carla = await createUser(db, 'carla');
});
afterAll(async () => db.close());

describe('login por @usuário', () => {
  it('a Edge Function (service role) acha o e-mail pelo username, sem diferenciar maiúsculas', async () => {
    expect(await asService(`select * from public.login_lookup('  CARLA ')`)).toEqual([{ user_id: carla, email: 'carla@teste.dev' }]);
    expect(await asService(`select * from public.login_lookup('ninguem')`)).toEqual([]);
  });

  it('o app (logado ou não) nunca consegue ler o e-mail de alguém pelo username', async () => {
    await expect(db.anon(`select * from public.login_lookup('carla')`)).rejects.toThrow(/permission denied/);
    await expect(db.as(carla, `select * from public.login_lookup('carla')`)).rejects.toThrow(/permission denied/);
  });

  it('tentativas ficam invisíveis para o app e contam só na janela de tempo', async () => {
    await asService(
      `insert into public.login_attempts (username, kind, success, created_at) values
        ('carla', 'password', false, now()), ('carla', 'password', false, now()),
        ('carla', 'password', true, now()), ('carla', 'password', false, now() - interval '1 hour')`,
    );
    expect(await asService(`select public.login_attempts_recent('carla', 'password', 15, true) as n`)).toEqual([{ n: 2 }]);
    expect(await asService(`select public.login_attempts_recent('carla', 'password', 15, false) as n`)).toEqual([{ n: 3 }]);
    await expect(db.anon(`select * from public.login_attempts`)).rejects.toThrow(/permission denied/);
    await expect(db.as(carla, `select public.login_attempts_recent('carla', 'password', 15, true)`)).rejects.toThrow(/permission denied/);
  });
});
