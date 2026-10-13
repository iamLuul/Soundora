import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

// Conta privada: só seguidores aprovados veem o conteúdo; seguir vira pedido.
let db: Db;
let priv: string; // conta privada
let fan: string; // pede para seguir e é aceito
let other: string; // não segue
let post: string;

beforeAll(async () => {
  db = await connect();
  priv = await createUser(db, 'prv_lia');
  fan = await createUser(db, 'prv_fan');
  other = await createUser(db, 'prv_out');
  const preview = await createPreview(db, 'https://open.spotify.com/track/prvtest1', 'Privada');
  post = (
    await db.as<{ id: string }>(priv, `insert into public.posts (author_id, link_preview_id, body) values ($1, $2, 'só para amigos') returning id`, [
      priv,
      preview,
    ])
  )[0]!.id;
  await db.as(priv, `select public.set_private(true)`);
});
afterAll(async () => db.close());

const summary = (user: string) =>
  db.as<{ is_private: boolean; requested: boolean; locked: boolean; i_follow: boolean; posts: number }>(
    user,
    `select is_private, requested, locked, i_follow, posts from public.profile_summary('prv_lia')`,
  );
const seesPost = async (user: string) => (await db.as(user, `select id from public.posts where id = $1`, [post])).length === 1;
const notes = (user: string) => db.as<{ kind: string; actor_username: string }>(user, `select kind, actor_username from public.notifications_list()`);

describe('conta privada', () => {
  it('quem não segue vê o cabeçalho, mas não o conteúdo', async () => {
    expect((await summary(other))[0]).toEqual({ is_private: true, requested: false, locked: true, i_follow: false, posts: 1 });
    expect(await seesPost(other)).toBe(false);
    expect(await db.as(other, `select * from public.profile_posts($1)`, [priv])).toEqual([]);
    expect(await db.as(other, `select * from public.post_detail($1)`, [post])).toEqual([]);
    expect(await db.as(other, `select * from public.profile_people('prv_lia', 'followers')`)).toEqual([]);
    // A dona vê tudo.
    expect(await seesPost(priv)).toBe(true);
    expect((await summary(priv))[0]!.locked).toBe(false);
  });

  it('não dá para curtir nem comentar sem seguir', async () => {
    await expect(db.as(other, `insert into public.likes (user_id, post_id) values ($1, $2)`, [other, post])).rejects.toThrow(/row-level security/);
    await expect(db.as(other, `insert into public.comments (author_id, post_id, body) values ($1, $2, 'oi')`, [other, post])).rejects.toThrow(
      /row-level security/,
    );
  });

  it('seguir direto é recusado; request_follow cria um pedido e avisa a dona', async () => {
    await expect(db.as(fan, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [fan, priv])).rejects.toThrow(/row-level security/);
    expect((await db.as<{ r: string }>(fan, `select public.request_follow($1) as r`, [priv]))[0]!.r).toBe('requested');
    expect((await summary(fan))[0]).toMatchObject({ requested: true, locked: true, i_follow: false });
    expect(await notes(priv)).toContainEqual(expect.objectContaining({ kind: 'follow_request', actor_username: 'prv_fan' }));
    expect((await db.as<{ username: string }>(priv, `select username from public.my_follow_requests()`)).map((r) => r.username)).toEqual(['prv_fan']);
    // Ninguém mexe nos pedidos direto na tabela.
    await expect(db.as(other, `insert into public.follow_requests (requester_id, target_id) values ($1, $2)`, [other, priv])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('aceitar: vira seguidor, vê o conteúdo e recebe "pedido aceito" (a dona não recebe "começou a seguir")', async () => {
    await db.as(priv, `select public.respond_follow_request($1, true)`, [fan]);
    expect((await summary(fan))[0]).toMatchObject({ requested: false, locked: false, i_follow: true });
    expect(await seesPost(fan)).toBe(true);
    expect(await notes(fan)).toContainEqual(expect.objectContaining({ kind: 'follow_accepted', actor_username: 'prv_lia' }));
    const mine = await notes(priv);
    expect(mine.find((n) => n.kind === 'follow')).toBeUndefined();
    // O pedido sumiu das notificações dela.
    expect(mine.find((n) => n.kind === 'follow_request')).toBeUndefined();
    await expect(db.as(priv, `select public.respond_follow_request($1, true)`, [fan])).rejects.toThrow(/request_not_found/);
  });

  it('recusar e cancelar apagam o pedido sem seguir', async () => {
    await db.as(other, `select public.request_follow($1)`, [priv]);
    await db.as(other, `select public.cancel_follow_request($1)`, [priv]);
    expect((await summary(other))[0]!.requested).toBe(false);
    expect((await notes(priv)).find((n) => n.kind === 'follow_request')).toBeUndefined();
    await db.as(other, `select public.request_follow($1)`, [priv]);
    await db.as(priv, `select public.respond_follow_request($1, false)`, [other]);
    expect((await summary(other))[0]).toMatchObject({ requested: false, i_follow: false, locked: true });
  });

  it('bloquear apaga o pedido', async () => {
    await db.as(other, `select public.request_follow($1)`, [priv]);
    await db.as(priv, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [priv, other]);
    expect(await db.as(priv, `select * from public.my_follow_requests()`)).toEqual([]);
    await db.as(priv, `delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [priv, other]);
  });

  it('voltar a ser pública aceita os pedidos pendentes e libera o conteúdo', async () => {
    await db.as(other, `select public.request_follow($1)`, [priv]);
    await db.as(priv, `select public.set_private(false)`);
    expect((await summary(other))[0]).toMatchObject({ is_private: false, i_follow: true, requested: false, locked: false });
    expect(await seesPost(other)).toBe(true);
    // Conta pública: seguir é direto.
    const fresh = await createUser(db, 'prv_new');
    expect((await db.as<{ r: string }>(fresh, `select public.request_follow($1) as r`, [priv]))[0]!.r).toBe('following');
  });

  it('só a própria pessoa liga a conta privada (coluna fora do update do app)', async () => {
    await expect(db.as(other, `update public.profiles set is_private = true where id = $1`, [other])).rejects.toThrow(/permission denied/);
  });
});
