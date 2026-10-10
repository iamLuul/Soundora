// Excluir a conta: a Edge Function delete-account apaga o usuário do Auth, e o banco apaga
// o resto em cascata. Aqui se confere que nada da pessoa fica para trás.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ivo: string;
let jade: string;

beforeAll(async () => {
  db = await connect();
  ivo = await createUser(db, 'ivo');
  jade = await createUser(db, 'jade');
});
afterAll(async () => db.close());

describe('excluir conta', () => {
  it('apaga perfil, posts, curtidas, comentários, seguidores, bloqueios e denúncias da pessoa', async () => {
    const preview = await createPreview(db, 'https://open.spotify.com/track/excluir');
    const [ivoPost] = await db.as<{ id: string }>(ivo, `insert into public.posts (author_id, body, link_preview_id) values ($1, 'meu', $2) returning id`, [ivo, preview]);
    const [jadePost] = await db.as<{ id: string }>(jade, `insert into public.posts (author_id, body, link_preview_id) values ($1, 'dela', $2) returning id`, [jade, preview]);
    await db.as(ivo, `insert into public.likes (user_id, post_id) values ($1, $2)`, [ivo, jadePost!.id]);
    await db.as(ivo, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'oi')`, [jadePost!.id, ivo]);
    await db.as(ivo, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [ivo, jade]);
    await db.as(jade, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [jade, ivo]);
    await db.as(ivo, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [ivo, jadePost!.id]);
    expect((await db.sql(`select like_count, comment_count from public.posts where id = $1`, [jadePost!.id]))[0]).toEqual({ like_count: 1, comment_count: 1 });

    // O que o admin.auth.admin.deleteUser faz no banco.
    await db.sql(`delete from auth.users where id = $1`, [ivo]);

    const leftovers = await db.sql<{ t: string; n: number }>(
      `select 'profiles' t, count(*)::int n from public.profiles where id = $1
       union all select 'profile_private', count(*)::int from public.profile_private where user_id = $1
       union all select 'user_genres', count(*)::int from public.user_genres where user_id = $1
       union all select 'posts', count(*)::int from public.posts where author_id = $1
       union all select 'likes', count(*)::int from public.likes where user_id = $1
       union all select 'comments', count(*)::int from public.comments where author_id = $1
       union all select 'follows', count(*)::int from public.follows where follower_id = $1 or followee_id = $1
       union all select 'reports', count(*)::int from public.reports where reporter_id = $1`,
      [ivo],
    );
    expect(leftovers.filter((r) => r.n > 0)).toEqual([]);
    expect(await db.sql(`select id from public.posts where id = $1`, [ivoPost!.id])).toEqual([]);
    // Os contadores do post de outra pessoa voltam ao que eram.
    expect((await db.sql(`select like_count, comment_count from public.posts where id = $1`, [jadePost!.id]))[0]).toEqual({ like_count: 0, comment_count: 0 });
  });

  it('a pessoa consegue remover um gênero (o limite de ações não cancela mais o DELETE)', async () => {
    const removed = await db.as<{ genre: string }>(jade, `delete from public.user_genres where user_id = $1 and genre = 'rock' returning genre`, [jade]);
    expect(removed).toEqual([{ genre: 'rock' }]);
  });
});
