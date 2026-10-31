import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let eu: string;
let chato: string;
let amigo: string;

async function post(author: string) {
  const preview = await createPreview(db, `https://open.spotify.com/track/${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`);
  const [row] = await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id) values ($1, $2) returning id`, [author, preview]);
  return row!.id;
}

const mute = (user: string, target: string, on = true) => db.as(user, `select public.set_user_muted($1, $2)`, [target, on]);

beforeAll(async () => {
  db = await connect();
  eu = await createUser(db, 'mute_eu');
  chato = await createUser(db, 'mute_chato');
  amigo = await createUser(db, 'mute_amigo');
  for (const f of [chato, amigo]) await db.sql(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [eu, f]);
});
afterAll(async () => db.close());

describe('silenciar perfil', () => {
  it('some do Seguindo, do Para você e das vibes; o perfil continua abrindo; desfazer volta', async () => {
    const p1 = await post(chato);
    const p2 = await post(amigo);
    await db.sql(`insert into public.vibes (author_id, kind, text) values ($1, 'text', 'oi')`, [chato]);
    const following = async () => (await db.as<{ id: string }>(eu, `select id from public.feed_following()`)).map((r) => r.id);
    const forYou = async () => (await db.as<{ id: string }>(eu, `select id from public.feed_for_you(50, 0)`)).map((r) => r.id);
    const tray = async () => (await db.as<{ author_id: string }>(eu, `select author_id from public.vibes_tray()`)).map((r) => r.author_id);
    expect(await following()).toContain(p1);
    expect(await tray()).toContain(chato);

    await mute(eu, chato);
    expect(await following()).not.toContain(p1);
    expect(await following()).toContain(p2);
    expect(await forYou()).not.toContain(p1);
    expect(await tray()).not.toContain(chato);
    // O perfil e os posts dele continuam abrindo se eu for até lá.
    expect((await db.as<{ id: string }>(eu, `select id from public.profile_posts($1)`, [chato])).map((r) => r.id)).toContain(p1);
    expect(await db.as<{ id: string }>(eu, `select * from public.my_muted_profiles()`)).toMatchObject([{ id: chato, username: 'mute_chato' }]);
    // Ele não fica sabendo.
    expect(await db.as(chato, `select * from public.muted_users`)).toEqual([]);

    await mute(eu, chato, false);
    expect(await following()).toContain(p1);
    expect(await db.as(eu, `select * from public.my_muted_profiles()`)).toEqual([]);
  });

  it('notificação de quem eu silenciei não chega', async () => {
    const meu = await post(eu);
    await mute(eu, chato);
    await db.as(chato, `insert into public.likes (user_id, post_id) values ($1, $2)`, [chato, meu]);
    await db.as(amigo, `insert into public.likes (user_id, post_id) values ($1, $2)`, [amigo, meu]);
    const rows = await db.sql<{ actor_id: string }>(`select actor_id from public.notifications where user_id = $1 and post_id = $2`, [eu, meu]);
    expect(rows.map((r) => r.actor_id)).toEqual([amigo]);
    await mute(eu, chato, false);
  });

  it('só pela função, só para mim, e não a mim mesmo', async () => {
    await expect(db.as(eu, `insert into public.muted_users (user_id, muted_id) values ($1, $2)`, [eu, amigo])).rejects.toThrow(/permission denied/);
    await expect(mute(eu, eu)).rejects.toThrow(/invalid_request/);
    await expect(mute(eu, crypto.randomUUID())).rejects.toThrow(/invalid_request/);
    await expect(db.anon(`select public.set_user_muted($1, true)`, [amigo])).rejects.toThrow(/permission denied/);
  });
});
