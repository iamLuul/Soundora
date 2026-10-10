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

  it('tentativas ficam invisíveis para o app', async () => {
    await expect(db.anon(`select * from public.login_attempts`)).rejects.toThrow(/permission denied/);
    await expect(db.as(carla, `select * from public.login_attempts`)).rejects.toThrow(/permission denied/);
    await expect(db.as(carla, `select public.login_attempt_start('carla', 'password', '1.2.3.4')`)).rejects.toThrow(/permission denied/);
    await expect(db.as(carla, `select public.login_attempt_finish(1, true)`)).rejects.toThrow(/permission denied/);
  });
});

/** Cada chamada abre a própria transação, como cada pedido à Edge Function. */
async function start(conn: Db, username: string, kind: string, ip: string | null) {
  await conn.sql('begin');
  await conn.sql('set local role service_role');
  const [row] = await conn.sql<{ id: string | null }>(`select public.login_attempt_start($1, $2, $3) as id`, [username, kind, ip]);
  await conn.sql('commit');
  return row!.id;
}

describe('limites do login por @ (login_attempt_start)', () => {
  it('50 pedidos simultâneos de senha: só 5 passam (antes, todos passavam)', async () => {
    await db.sql(`delete from public.login_attempts`);
    // Uma conexão por pedido, todas ao mesmo tempo.
    const conns = await Promise.all(Array.from({ length: 50 }, () => connect()));
    try {
      const results = await Promise.all(conns.map((c) => start(c, 'carla', 'password', null)));
      expect(results.filter((id) => id !== null)).toHaveLength(5);
    } finally {
      await Promise.all(conns.map((c) => c.close()));
    }
  });

  it('senha certa não conta como falha', async () => {
    await db.sql(`delete from public.login_attempts`);
    for (let i = 0; i < 10; i++) {
      const id = await start(db, 'carla', 'password', null);
      expect(id).not.toBeNull();
      await asService(`select public.login_attempt_finish($1, true)`, [id]);
    }
  });

  it('códigos: 3 a cada 10 minutos e 6 por dia, por @', async () => {
    await db.sql(`delete from public.login_attempts`);
    for (let i = 0; i < 3; i++) expect(await start(db, 'carla', 'send_code', null)).not.toBeNull();
    expect(await start(db, 'carla', 'send_code', null)).toBeNull();
    // Os 3 primeiros "ficam velhos" (mais de 10 min): libera mais 3, até 6 no dia.
    await db.sql(`update public.login_attempts set created_at = now() - interval '11 minutes'`);
    for (let i = 0; i < 3; i++) expect(await start(db, 'carla', 'send_code', null)).not.toBeNull();
    await db.sql(`update public.login_attempts set created_at = now() - interval '11 minutes'`);
    expect(await start(db, 'carla', 'send_code', null)).toBeNull();
  });

  it('por IP: no máximo 20 falhas somando todos os @ (contra testar uma senha em muitos @)', async () => {
    await db.sql(`delete from public.login_attempts`);
    for (let i = 0; i < 20; i++) expect(await start(db, `vitima${i}`, 'password', '203.0.113.7')).not.toBeNull();
    expect(await start(db, 'outra', 'password', '203.0.113.7')).toBeNull();
    expect(await start(db, 'outra', 'password', '198.51.100.1')).not.toBeNull();
  });

  it('tentativas com mais de 2 dias são apagadas', async () => {
    await db.sql(`delete from public.login_attempts`);
    await db.sql(`insert into public.login_attempts (username, kind, success, created_at) values ('velho', 'password', false, now() - interval '3 days')`);
    await start(db, 'carla', 'password', null);
    expect(await db.sql(`select username from public.login_attempts where username = 'velho'`)).toEqual([]);
  });
});
