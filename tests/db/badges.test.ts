import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

// Selos do perfil: só a equipe concede; pausar, reabrir e encerrar para sempre; quem vê.
let db: Db;
let admin: string;
let ana: string;
let bia: string;
let bloqueou: string;
let early: string;

interface Badge {
  slug: string;
  name_pt: string;
  granted_at: Date;
  limited: boolean;
}
const badgesOf = (viewer: string, user: string) => db.as<Badge>(viewer, `select * from public.profile_badges($1)`, [user]);

beforeAll(async () => {
  db = await connect();
  admin = await createUser(db, 'badge_admin');
  ana = await createUser(db, 'badge_ana');
  bia = await createUser(db, 'badge_bia');
  bloqueou = await createUser(db, 'badge_bloq');
  await db.sql(`insert into public.admins (user_id) values ($1)`, [admin]);
  await db.as(bloqueou, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [bloqueou, bia]);
  const [b] = await db.sql<{ id: string }>(`select id from public.badges where slug = 'early_supporter'`);
  early = b!.id;
});
afterAll(async () => {
  // Não deixa um admin a mais para os outros arquivos (o painel conta admins e usuários).
  await db.sql(`delete from public.admins where user_id = $1`, [admin]);
  await db.close();
});

describe('conceder e ver', () => {
  it('o selo inicial existe e o admin concede pelo @ (com ou sem @); repetir não duplica', async () => {
    await db.as(admin, `select public.admin_grant_badge($1, '@Badge_Ana ')`, [early]);
    await db.as(admin, `select public.admin_grant_badge($1, 'badge_ana')`, [early]);
    const list = await badgesOf(bia, ana);
    expect(list.map((b) => [b.slug, b.name_pt, b.limited])).toEqual([['early_supporter', 'Contribuidor inicial', false]]);
    const log = await db.sql(`select action, target_id from public.admin_actions where action = 'badge_grant'`);
    expect(log).toEqual([{ action: 'badge_grant', target_id: ana }]);
  });

  it('quem não é admin não concede nem mexe no catálogo', async () => {
    await expect(db.as(ana, `select public.admin_grant_badge($1, 'badge_bia')`, [early])).rejects.toThrow('forbidden');
    await expect(db.as(ana, `insert into public.user_badges (user_id, badge_id) values ($1, $2)`, [ana, early])).rejects.toThrow(/permission denied/);
    await expect(db.as(ana, `update public.badges set grants_open = false`)).rejects.toThrow(/permission denied/);
    await expect(db.as(ana, `select * from public.user_badges`)).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.profile_badges($1)`, [ana])).rejects.toThrow(/permission denied/);
  });

  it('com bloqueio, os selos não aparecem', async () => {
    await db.as(admin, `select public.admin_grant_badge($1, 'badge_bloq')`, [early]);
    expect(await badgesOf(bia, bloqueou)).toEqual([]);
    expect(await badgesOf(ana, bloqueou)).toHaveLength(1);
  });

  it('@ que não existe e selo automático: erro legível', async () => {
    await expect(db.as(admin, `select public.admin_grant_badge($1, 'ninguem_aqui')`, [early])).rejects.toThrow('user_not_found');
    const [auto] = await db.sql<{ id: string }>(
      `insert into public.badges (slug, icon, name_pt, name_en, description_pt, description_en, award) values ('teste_auto', 'medal', 'A', 'A', 'a', 'a', 'auto') returning id`,
    );
    await expect(db.as(admin, `select public.admin_grant_badge($1, 'badge_bia')`, [auto!.id])).rejects.toThrow('badge_not_manual');
  });
});

describe('disponibilidade', () => {
  it('pausado não entrega (nem pelo admin); reaberto volta a entregar', async () => {
    await db.as(admin, `select public.admin_set_badge_open($1, false)`, [early]);
    await expect(db.as(admin, `select public.admin_grant_badge($1, 'badge_bia')`, [early])).rejects.toThrow('badge_unavailable');
    expect((await badgesOf(bia, ana))[0]!.limited).toBe(true);
    await db.as(admin, `select public.admin_set_badge_open($1, true)`, [early]);
    await db.as(admin, `select public.admin_grant_badge($1, 'badge_bia')`, [early]);
    expect(await badgesOf(ana, bia)).toHaveLength(1);
  });

  it('com data no futuro ainda entrega; a data pode ser mudada antes de chegar', async () => {
    await db.as(admin, `select public.admin_set_badge_until($1, now() + interval '7 days')`, [early]);
    await db.as(admin, `select public.admin_set_badge_until($1, null)`, [early]);
    const [b] = await db.as<{ available_until: Date | null; grantable: boolean }>(admin, `select available_until, grantable from public.admin_badges() where slug = 'early_supporter'`);
    expect(b).toEqual({ available_until: null, grantable: true });
  });

  it('encerrado: ninguém mais recebe, nem o admin, nem pelo banco; não reabre; quem tem continua tendo', async () => {
    const holdersBefore = await db.as(admin, `select * from public.admin_badge_holders($1)`, [early]);
    await db.as(admin, `select public.admin_set_badge_until($1, now() - interval '1 day')`, [early]);
    const [b] = await db.as<{ retired: boolean; grantable: boolean; holders: number }>(admin, `select retired, grantable, holders from public.admin_badges() where slug = 'early_supporter'`);
    expect(b).toEqual({ retired: true, grantable: false, holders: holdersBefore.length });
    const carla = await createUser(db, 'badge_carla');
    await expect(db.as(admin, `select public.admin_grant_badge($1, 'badge_carla')`, [early])).rejects.toThrow('badge_unavailable');
    await expect(db.sql(`insert into public.user_badges (user_id, badge_id) values ($1, $2)`, [carla, early])).rejects.toThrow('badge_unavailable');
    await expect(db.as(admin, `select public.admin_set_badge_until($1, null)`, [early])).rejects.toThrow('badge_retired');
    await expect(db.as(admin, `select public.admin_set_badge_until($1, now() + interval '30 days')`, [early])).rejects.toThrow('badge_retired');
    // Pausar ainda pode (não muda nada), reabrir não.
    await db.as(admin, `select public.admin_set_badge_open($1, false)`, [early]);
    await expect(db.as(admin, `select public.admin_set_badge_open($1, true)`, [early])).rejects.toThrow('badge_retired');
    const list = await badgesOf(bia, ana);
    expect(list.map((x) => [x.slug, x.limited])).toEqual([['early_supporter', true]]);
  });

  it('o admin pode tirar o selo de alguém (registrado)', async () => {
    await db.as(admin, `select public.admin_revoke_badge($1, $2)`, [early, bia]);
    expect(await badgesOf(ana, bia)).toEqual([]);
    const log = await db.sql(`select count(*)::int as n from public.admin_actions where action = 'badge_revoke' and target_id = $1`, [bia]);
    expect(log[0]).toEqual({ n: 1 });
  });
});

describe('link de apoio', () => {
  it('só aceita página do Patreon com https; o app lê', async () => {
    await expect(db.sql(`update public.app_config set support_url = 'http://patreon.com/soundhora'`)).rejects.toThrow(/check/);
    await expect(db.sql(`update public.app_config set support_url = 'https://evil.com/patreon.com/x'`)).rejects.toThrow(/check/);
    await db.sql(`update public.app_config set support_url = 'https://www.patreon.com/soundhora'`);
    const [row] = await db.as(ana, `select support_url from public.app_config`);
    expect(row).toEqual({ support_url: 'https://www.patreon.com/soundhora' });
    await db.as(ana, `update public.app_config set support_url = 'https://www.patreon.com/outro'`);
    const [same] = await db.sql(`select support_url from public.app_config`);
    expect(same).toEqual({ support_url: 'https://www.patreon.com/soundhora' });
    await db.sql(`update public.app_config set support_url = null`);
  });
});
