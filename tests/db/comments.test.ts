import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let caio: string;
let duda: string;
let post: string;

interface Row {
  id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  reply_count: number;
  liked_by_me: boolean;
  author_username: string;
}

const comment = async (user: string, body: string, parent: string | null = null) =>
  (
    await db.as<{ id: string }>(user, `insert into public.comments (post_id, author_id, body, parent_id) values ($1, $2, $3, $4) returning id`, [
      post,
      user,
      body,
      parent,
    ])
  )[0]!.id;
const list = (user: string) => db.as<Row>(user, `select * from public.post_comments($1)`, [post]);
const notifs = (user: string) =>
  db.sql<{ kind: string; actor: string; comment_id: string }>(
    `select n.kind, p.username as actor, n.comment_id from public.notifications n join public.profiles p on p.id = n.actor_id where n.user_id = $1 and n.post_id = $2 order by n.id`,
    [user, post],
  );

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'cmt_ana');
  bia = await createUser(db, 'cmt_bia');
  caio = await createUser(db, 'cmt_caio');
  duda = await createUser(db, 'cmt_duda');
  const preview = await createPreview(db, 'https://open.spotify.com/track/comments000000000000001');
  // 20 dias atrás: fica fora do feed e não atrapalha o teste do feed.
  post = (await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id, created_at) values ($1, $2, now() - interval '20 days') returning id`, [ana, preview]))[0]!.id;
});
afterAll(async () => db.close());

describe('respostas a comentários', () => {
  it('responder, e responder a resposta pendura no comentário principal', async () => {
    const root = await comment(bia, 'que som!');
    const reply = await comment(caio, '@cmt_bia concordo', root);
    const replyOfReply = await comment(duda, '@cmt_caio também acho', reply);

    const rows = await list(ana);
    expect(rows.map((r) => [r.body, r.parent_id])).toEqual([
      ['que som!', null],
      ['@cmt_bia concordo', root],
      ['@cmt_caio também acho', root],
    ]);
    expect(rows[0]!.reply_count).toBe(2);
    expect(replyOfReply).toBeTruthy();
  });

  it('não dá para responder comentário de outro post', async () => {
    const preview = await createPreview(db, 'https://open.spotify.com/track/comments000000000000002');
    const other = (await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id, created_at) values ($1, $2, now() - interval '20 days') returning id`, [bia, preview]))[0]!.id;
    const foreign = (await db.as<{ id: string }>(bia, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'outro') returning id`, [other, bia]))[0]!.id;
    await expect(comment(caio, 'x', foreign)).rejects.toThrow(/invalid_parent/);
  });

  it('o app não mexe nos contadores', async () => {
    await expect(db.as(bia, `insert into public.comments (post_id, author_id, body, like_count) values ($1, $2, 'x', 99)`, [post, bia])).rejects.toThrow(/permission denied/);
    await expect(db.as(bia, `update public.comments set like_count = 99 where author_id = $1`, [bia])).rejects.toThrow(/permission denied/);
  });

  it('avisos: quem foi respondido recebe "respondeu você"; o dono do post, "comentou"; ninguém recebe dois', async () => {
    const forBia = await notifs(bia);
    expect(forBia.filter((n) => n.kind === 'comment_reply').map((n) => n.actor)).toEqual(['cmt_caio']);
    const forCaio = await notifs(caio);
    expect(forCaio.filter((n) => n.kind === 'comment_reply').map((n) => n.actor)).toEqual(['cmt_duda']);
    // A Ana (dona do post) recebe "comentou" de cada um.
    expect((await notifs(ana)).map((n) => n.kind)).toEqual(['comment', 'comment', 'comment']);
    // Para o mesmo comentário, ninguém recebe "respondeu você" e "também comentou" juntos.
    for (const user of [bia, caio]) {
      const rows = await notifs(user);
      const byComment = new Map<string, number>();
      for (const n of rows) byComment.set(n.comment_id, (byComment.get(n.comment_id) ?? 0) + 1);
      expect([...byComment.values()].every((c) => c === 1)).toBe(true);
    }
  });
});

describe('curtir comentários', () => {
  it('curte, conta, marca o meu, avisa uma vez e desfaz', async () => {
    const [root] = await list(ana);
    await db.as(ana, `insert into public.comment_likes (user_id, comment_id) values ($1, $2)`, [ana, root!.id]);
    await db.as(ana, `delete from public.comment_likes where user_id = $1 and comment_id = $2`, [ana, root!.id]);
    await db.as(ana, `insert into public.comment_likes (user_id, comment_id) values ($1, $2)`, [ana, root!.id]);
    await db.as(caio, `insert into public.comment_likes (user_id, comment_id) values ($1, $2)`, [caio, root!.id]);

    const mine = (await list(ana))[0]!;
    expect(mine).toMatchObject({ like_count: 2, liked_by_me: true });
    expect((await list(duda))[0]!.liked_by_me).toBe(false);
    expect((await notifs(bia)).filter((n) => n.kind === 'comment_like').map((n) => n.actor)).toEqual(['cmt_ana', 'cmt_caio']);

    await db.as(caio, `delete from public.comment_likes where user_id = $1 and comment_id = $2`, [caio, root!.id]);
    expect((await list(ana))[0]!.like_count).toBe(1);
    expect((await notifs(bia)).filter((n) => n.kind === 'comment_like').map((n) => n.actor)).toEqual(['cmt_ana']);
  });

  it('só curte em nome próprio, e não curte comentário de quem tem bloqueio', async () => {
    const [root] = await list(ana);
    await expect(db.as(caio, `insert into public.comment_likes (user_id, comment_id) values ($1, $2)`, [duda, root!.id])).rejects.toThrow(/row-level security/);
    await db.as(bia, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [bia, duda]);
    await expect(db.as(duda, `insert into public.comment_likes (user_id, comment_id) values ($1, $2)`, [duda, root!.id])).rejects.toThrow(/row-level security/);
    // Quem bloqueou não vê os comentários da pessoa (nem as respostas penduradas neles).
    expect((await list(duda)).some((r) => r.author_username === 'cmt_bia')).toBe(false);
    expect((await list(duda)).length).toBe(0);
  });
});

describe('gênero só em post com música', () => {
  it('post de texto com gênero é recusado', async () => {
    await expect(db.as(caio, `select public.post_create('só texto', null, '{rock}', '[]')`)).rejects.toThrow(/genres_need_music/);
    await expect(db.as(caio, `insert into public.posts (author_id, body, genres) values ($1, 'x', '{rock}')`, [caio])).rejects.toThrow(/posts_genres_need_music/);
  });
});
