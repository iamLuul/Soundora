import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

// Configurações: gênero, gêneros silenciados e notificações desligadas.
let db: Db;
let ana: string;
let bia: string;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'cfg_ana', { birthdate: '2000-03-15', genres: ['rock', 'indie', 'pop'] });
  bia = await createUser(db, 'cfg_bia', { genres: ['rock', 'indie', 'pop'] });
});
afterAll(async () => db.close());

describe('sua conta', () => {
  it('my_account traz criação, nascimento, idade e gênero; só da própria pessoa', async () => {
    const [row] = await db.as<{ birthdate: Date; age: number; is_minor: boolean; gender: string | null; is_private: boolean }>(
      ana,
      `select * from public.my_account()`,
    );
    expect(row!.age).toBeGreaterThanOrEqual(26);
    expect(row!.is_minor).toBe(false);
    expect(row!.gender).toBeNull();
    expect(row!.is_private).toBe(false);
    await expect(db.anon(`select * from public.my_account()`)).rejects.toThrow(/permission denied/);
  });

  it('gênero: valores da lista ou null; ninguém mais vê', async () => {
    await db.as(ana, `select public.set_gender('non_binary')`);
    expect((await db.as<{ gender: string }>(ana, `select gender from public.my_account()`))[0]!.gender).toBe('non_binary');
    await expect(db.as(ana, `select public.set_gender('robô')`)).rejects.toThrow(/invalid_request/);
    expect(await db.as(bia, `select gender from public.profile_private where user_id = $1`, [ana])).toEqual([]);
    await db.as(ana, `select public.set_gender(null)`);
    expect((await db.as<{ gender: string | null }>(ana, `select gender from public.my_account()`))[0]!.gender).toBeNull();
  });
});

describe('gêneros silenciados', () => {
  it('somem do Para você; a lista troca inteira e só aceita gêneros do catálogo', async () => {
    const preview = await createPreview(db, 'https://open.spotify.com/track/cfgmute1', 'Barulho');
    const post = (
      await db.as<{ id: string }>(bia, `insert into public.posts (author_id, link_preview_id, genres) values ($1, $2, '{metal}') returning id`, [bia, preview])
    )[0]!.id;
    const forYou = async () => (await db.as<{ id: string }>(ana, `select id from public.feed_for_you(50)`)).map((r) => r.id);
    expect(await forYou()).toContain(post);
    await db.as(ana, `select public.set_muted_genres('{metal,jazz}')`);
    expect((await db.as<{ genre: string }>(ana, `select genre from public.muted_genres order by genre`)).map((r) => r.genre)).toEqual(['jazz', 'metal']);
    expect(await forYou()).not.toContain(post);
    // A Bia não vê os silenciados da Ana nem mexe na tabela direto.
    expect(await db.as(bia, `select * from public.muted_genres where user_id = $1`, [ana])).toEqual([]);
    await expect(db.as(bia, `insert into public.muted_genres (user_id, genre) values ($1, 'pop')`, [bia])).rejects.toThrow(/permission denied/);
    await expect(db.as(ana, `select public.set_muted_genres('{nao_existe_genero}')`)).rejects.toThrow(/invalid_request/);
    await db.as(ana, `select public.set_muted_genres('{}')`);
    expect(await forYou()).toContain(post);
  });
});

describe('notificações desligadas', () => {
  it('tipo desligado não chega; os outros continuam', async () => {
    await db.as(ana, `select public.set_notification_settings('{follow}')`);
    await db.as(bia, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [bia, ana]);
    const kinds = async () => (await db.as<{ kind: string }>(ana, `select kind from public.notifications_list()`)).map((r) => r.kind);
    expect(await kinds()).not.toContain('follow');
    const preview = await createPreview(db, 'https://open.spotify.com/track/cfgmute2', 'Oi');
    const post = (await db.as<{ id: string }>(ana, `insert into public.posts (author_id, link_preview_id) values ($1, $2) returning id`, [ana, preview]))[0]!
      .id;
    await db.as(bia, `insert into public.likes (user_id, post_id) values ($1, $2)`, [bia, post]);
    expect(await kinds()).toContain('like');
    await expect(db.as(ana, `select public.set_notification_settings('{spam}')`)).rejects.toThrow(/invalid_request/);
    expect((await db.as<{ muted_kinds: string[] }>(ana, `select muted_kinds from public.notification_settings`))[0]!.muted_kinds).toEqual(['follow']);
  });
});
