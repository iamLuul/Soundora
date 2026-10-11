import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let caio: string;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'blk_ana');
  bia = await createUser(db, 'blk_bia');
  caio = await createUser(db, 'blk_caio');
});
afterAll(async () => db.close());

const blocked = (user: string) => db.as<{ username: string }>(user, `select username from public.my_blocked_profiles()`);
const search = (user: string, q: string) => db.as<{ username: string; blocked_by_me: boolean }>(user, `select username, blocked_by_me from public.search_profiles($1)`, [q]);

describe('bloqueados', () => {
  it('lista quem eu bloqueei (o mais recente primeiro), só os campos do cartão', async () => {
    await db.as(ana, `insert into public.blocks (blocker_id, blocked_id, created_at) values ($1, $2, now() - interval '1 hour')`, [ana, bia]);
    await db.as(ana, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [ana, caio]);
    expect((await blocked(ana)).map((r) => r.username)).toEqual(['blk_caio', 'blk_bia']);
    const [row] = await db.as(ana, `select * from public.my_blocked_profiles()`);
    expect(Object.keys(row!).sort()).toEqual(['avatar_url', 'blocked_at', 'display_name', 'id', 'username']);
    // Cada um só vê os próprios bloqueios.
    expect(await blocked(bia)).toEqual([]);
    await expect(db.anon(`select * from public.my_blocked_profiles()`)).rejects.toThrow(/permission denied/);
  });

  it('na busca: quem eu bloqueei aparece marcado; quem me bloqueou não aparece', async () => {
    expect((await search(ana, 'blk_bia')).find((r) => r.username === 'blk_bia')).toEqual({ username: 'blk_bia', blocked_by_me: true });
    expect((await search(bia, 'blk_ana')).map((r) => r.username)).not.toContain('blk_ana');
    await expect(db.anon(`select * from public.search_profiles('blk_ana')`)).rejects.toThrow(/permission denied/);
  });

  it('desbloquear volta tudo ao normal, e só o próprio bloqueio', async () => {
    await db.as(bia, `delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [ana, bia]);
    expect((await blocked(ana)).map((r) => r.username)).toContain('blk_bia');
    await db.as(ana, `delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [ana, bia]);
    expect((await blocked(ana)).map((r) => r.username)).toEqual(['blk_caio']);
    expect((await search(ana, 'blk_bia')).find((r) => r.username === 'blk_bia')).toEqual({ username: 'blk_bia', blocked_by_me: false });
    expect((await search(bia, 'blk_ana')).map((r) => r.username)).toContain('blk_ana');
  });
});
