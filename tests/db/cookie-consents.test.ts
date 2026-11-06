import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let eu: string;
let outra: string;

const record = (user: string, preferences: boolean, personalization: boolean, version = 1, platform = 'web') =>
  db.as(user, `select public.record_cookie_consent($1, $2, $3, $4)`, [preferences, personalization, version, platform]);

beforeAll(async () => {
  db = await connect();
  eu = await createUser(db, 'cookie_eu');
  outra = await createUser(db, 'cookie_outra');
});
afterAll(async () => db.close());

describe('consentimento de cookies (prova da escolha, LGPD)', () => {
  it('cada escolha vira uma linha; a pessoa só vê o próprio histórico', async () => {
    await record(eu, true, false);
    await record(eu, false, false, 1, 'android');
    await record(outra, true, true);
    const mine = await db.as<{ preferences: boolean; personalization: boolean; platform: string; user_id: string }>(
      eu,
      `select user_id, preferences, personalization, platform from public.cookie_consents order by id`,
    );
    expect(mine).toEqual([
      { user_id: eu, preferences: true, personalization: false, platform: 'web' },
      { user_id: eu, preferences: false, personalization: false, platform: 'android' },
    ]);
  });

  it('só pela função, com login e valores válidos', async () => {
    await expect(db.as(eu, `insert into public.cookie_consents (user_id, preferences, personalization, version, platform) values ($1, true, true, 1, 'web')`, [eu])).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select public.record_cookie_consent(true, true, 1, 'web')`)).rejects.toThrow(/permission denied/);
    await expect(record(eu, true, true, 0)).rejects.toThrow(/invalid_request/);
    await expect(record(eu, true, true, 1, 'windows')).rejects.toThrow(/invalid_request/);
  });

  it('apagar a conta apaga o histórico', async () => {
    const temp = await createUser(db, 'cookie_temp');
    await record(temp, true, true);
    await db.sql(`delete from public.profiles where id = $1`, [temp]);
    expect((await db.sql(`select 1 from public.cookie_consents where user_id = $1`, [temp])).length).toBe(0);
  });
});
