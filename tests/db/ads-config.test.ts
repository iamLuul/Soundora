import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

// Anúncios: a chave liga/desliga e a frequência ficam em app_config; só a equipe muda (pelo banco).
let db: Db;
let ana: string;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'ads_ana');
});
afterAll(async () => db.close());

describe('app_config dos anúncios', () => {
  it('vem desligado, com um anúncio a cada 8 posts e uma vibe anunciada a cada 4 pessoas', async () => {
    const [row] = await db.as<{ ads_enabled: boolean; ads_feed_every: number; ads_vibes_every: number }>(
      ana,
      `select ads_enabled, ads_feed_every, ads_vibes_every from public.app_config`,
    );
    expect(row).toEqual({ ads_enabled: false, ads_feed_every: 8, ads_vibes_every: 4 });
  });

  it('o app não liga nem muda os anúncios', async () => {
    await db.as(ana, `update public.app_config set ads_enabled = true, ads_feed_every = 5`);
    const [row] = await db.sql(`select ads_enabled, ads_feed_every from public.app_config`);
    expect(row).toEqual({ ads_enabled: false, ads_feed_every: 8 });
  });

  it('frequência dentro dos limites (anúncio não encosta nas contas sugeridas nem vira um a cada vibe)', async () => {
    await expect(db.sql(`update public.app_config set ads_feed_every = 4`)).rejects.toThrow(/check/);
    await expect(db.sql(`update public.app_config set ads_vibes_every = 1`)).rejects.toThrow(/check/);
  });
});
