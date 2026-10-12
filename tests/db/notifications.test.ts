import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let caio: string;
let duda: string;

interface Row {
  id: string;
  kind: string;
  read: boolean;
  actor_username: string;
  post_id: string | null;
  preview_title: string | null;
  comment_body: string | null;
}

async function post(author: string, title = 'Faixa') {
  const preview = await createPreview(db, `https://open.spotify.com/track/${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`, title);
  // Posts de 20 dias atrás: ficam fora do feed (14 dias) e não atrapalham o teste do feed.
  const [row] = await db.sql<{ id: string }>(
    `insert into public.posts (author_id, link_preview_id, created_at) values ($1, $2, now() - interval '20 days') returning id`,
    [author, preview],
  );
  return row!.id;
}

const list = (user: string, filter = 'all') => db.as<Row>(user, `select * from public.notifications_list($1)`, [filter]);
const unread = async (user: string) => (await db.as<{ n: number }>(user, `select public.notifications_unread_count() as n`))[0]!.n;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'notif_ana');
  bia = await createUser(db, 'notif_bia');
  caio = await createUser(db, 'notif_caio');
  duda = await createUser(db, 'notif_duda');
});
afterAll(async () => db.close());

describe('notificações', () => {
  it('curtida: avisa o dono do post uma vez só, e some ao descurtir', async () => {
    const p = await post(ana, 'Curtível');
    await db.as(bia, `insert into public.likes (user_id, post_id) values ($1, $2)`, [bia, p]);
    await db.as(bia, `delete from public.likes where user_id = $1 and post_id = $2`, [bia, p]);
    await db.as(bia, `insert into public.likes (user_id, post_id) values ($1, $2)`, [bia, p]);

    const likes = (await list(ana)).filter((r) => r.kind === 'like' && r.post_id === p);
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({ actor_username: 'notif_bia', preview_title: 'Curtível', read: false });

    await db.as(bia, `delete from public.likes where user_id = $1 and post_id = $2`, [bia, p]);
    expect((await list(ana)).filter((r) => r.kind === 'like' && r.post_id === p)).toHaveLength(0);
  });

  it('curtir o próprio post não gera notificação', async () => {
    const p = await post(ana);
    await db.as(ana, `insert into public.likes (user_id, post_id) values ($1, $2)`, [ana, p]);
    expect((await list(ana)).filter((r) => r.post_id === p)).toHaveLength(0);
  });

  it('seguir avisa uma vez; deixar de seguir apaga', async () => {
    await db.as(caio, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [caio, ana]);
    await db.as(caio, `delete from public.follows where follower_id = $1 and followee_id = $2`, [caio, ana]);
    await db.as(caio, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [caio, ana]);
    expect((await list(ana)).filter((r) => r.kind === 'follow' && r.actor_username === 'notif_caio')).toHaveLength(1);
  });

  it('comentário avisa o dono; quem já comentou recebe "também comentou", sem acumular', async () => {
    const p = await post(ana, 'Debate');
    await db.as(bia, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'primeiro')`, [p, bia]);
    await db.as(caio, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'segundo')`, [p, caio]);
    await db.as(duda, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'terceiro')`, [p, duda]);

    const forAna = (await list(ana, 'replies')).filter((r) => r.post_id === p);
    expect(forAna.map((r) => [r.kind, r.actor_username, r.comment_body])).toEqual([
      ['comment', 'notif_duda', 'terceiro'],
      ['comment', 'notif_caio', 'segundo'],
      ['comment', 'notif_bia', 'primeiro'],
    ]);

    // Bia comentou antes: recebe só a resposta mais recente (a da Duda), não duas.
    const forBia = (await list(bia, 'replies')).filter((r) => r.post_id === p);
    expect(forBia.map((r) => [r.kind, r.actor_username])).toEqual([['reply', 'notif_duda']]);
    // O dono do post não recebe "reply" além do "comment".
    expect(forAna.some((r) => r.kind === 'reply')).toBe(false);
  });

  it('a aba Respostas mostra só comentários e respostas', async () => {
    const replies = await list(ana, 'replies');
    expect(replies.every((r) => r.kind === 'comment' || r.kind === 'reply')).toBe(true);
    expect((await list(ana)).some((r) => r.kind === 'like' || r.kind === 'follow')).toBe(true);
  });

  it('não lidas: conta e zera ao marcar como lidas', async () => {
    expect(await unread(ana)).toBeGreaterThan(0);
    await db.as(ana, `select public.notifications_mark_read()`);
    expect(await unread(ana)).toBe(0);
    expect((await list(ana)).every((r) => r.read)).toBe(true);
  });

  it('bloqueio: quem bloqueou não recebe nada da pessoa, nem as antigas aparecem', async () => {
    const p = await post(duda);
    await db.as(bia, `insert into public.likes (user_id, post_id) values ($1, $2)`, [bia, p]);
    expect((await list(duda)).some((r) => r.actor_username === 'notif_bia')).toBe(true);

    await db.as(duda, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [duda, bia]);
    expect((await list(duda)).some((r) => r.actor_username === 'notif_bia')).toBe(false);

    const p2 = await post(duda);
    await db.sql(`insert into public.likes (user_id, post_id) values ($1, $2)`, [bia, p2]);
    const [row] = await db.sql<{ n: string }>(`select count(*) as n from public.notifications where user_id = $1 and actor_id = $2 and post_id = $3`, [duda, bia, p2]);
    expect(Number(row!.n)).toBe(0);
  });

  it('ninguém lê as notificações de outra pessoa', async () => {
    // Pela função: só as minhas.
    expect((await list(caio)).length).toBeGreaterThan(0);
    expect((await list(caio)).every((r) => r.actor_username !== 'notif_caio')).toBe(true);
    // A tabela não é acessível direto, nem para ler nem para criar.
    await expect(db.as(caio, `select * from public.notifications`)).rejects.toThrow(/permission denied/);
    await expect(
      db.as(caio, `insert into public.notifications (user_id, actor_id, kind) values ($1, $2, 'follow')`, [ana, caio]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.notifications_list()`)).rejects.toThrow(/permission denied/);
  });
});

describe('aparelhos para push', () => {
  const token = 'ExponentPushToken[abcdefghij0123456789]';

  it('cadastra, passa para outra conta no mesmo aparelho e descadastra', async () => {
    await db.as(ana, `select public.push_token_register($1, 'android')`, [token]);
    let [row] = await db.sql<{ user_id: string }>(`select user_id from public.push_tokens where token = $1`, [token]);
    expect(row!.user_id).toBe(ana);

    await db.as(bia, `select public.push_token_register($1, 'android')`, [token]);
    [row] = await db.sql<{ user_id: string }>(`select user_id from public.push_tokens where token = $1`, [token]);
    expect(row!.user_id).toBe(bia);

    // Ana não consegue apagar o token que agora é da Bia.
    await db.as(ana, `select public.push_token_unregister($1)`, [token]);
    expect(await db.sql(`select 1 from public.push_tokens where token = $1`, [token])).toHaveLength(1);
    await db.as(bia, `select public.push_token_unregister($1)`, [token]);
    expect(await db.sql(`select 1 from public.push_tokens where token = $1`, [token])).toHaveLength(0);
  });

  it('recusa token que não é da Expo e não deixa ler a tabela', async () => {
    await expect(db.as(ana, `select public.push_token_register('https://evil.example', 'ios')`)).rejects.toThrow(/check constraint/);
    await expect(db.as(ana, `select * from public.push_tokens`)).rejects.toThrow(/permission denied/);
  });

  it('sem pg_net (testes), notificar com aparelho cadastrado não quebra a curtida', async () => {
    await db.as(caio, `select public.push_token_register($1, 'ios')`, ['ExponentPushToken[caio_device_000000]']);
    const p = await post(caio);
    await db.as(ana, `insert into public.likes (user_id, post_id) values ($1, $2)`, [ana, p]);
    expect((await list(caio)).some((r) => r.kind === 'like' && r.post_id === p)).toBe(true);
  });
});

describe('texto do push', () => {
  it('no idioma de quem recebe, sem dados privados', async () => {
    const [pt] = await db.sql<{ t: { title: string; body: string } }>(`select private.push_text('like', 'pt-BR', 'bia', null) as t`);
    expect(pt!.t).toEqual({ title: 'Nova curtida', body: '@bia curtiu seu post' });
    const [en] = await db.sql<{ t: { title: string; body: string } }>(`select private.push_text('comment', 'en', 'bia', repeat('x', 300)) as t`);
    expect(en!.t.title).toBe('@bia commented');
    expect(en!.t.body).toHaveLength(120);
  });
});

describe('envio do push (pg_net simulado)', () => {
  beforeAll(async () => {
    // Imita a assinatura do pg_net e guarda o que seria enviado.
    await db.sql(`create schema if not exists net`);
    await db.sql(`create table if not exists net.sent (url text, body jsonb)`);
    await db.sql(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$ insert into net.sent values (url, body); select 1::bigint $$`);
  });
  afterAll(async () => {
    await db.sql(`drop schema net cascade`);
  });

  it('manda para os aparelhos de quem recebe, no idioma dele, e abre a tela de notificações', async () => {
    await db.sql(`update public.profiles set locale = 'en' where id = $1`, [duda]);
    await db.as(duda, `select public.push_token_register($1, 'ios')`, ['ExponentPushToken[duda_phone_0000000]']);
    await db.as(caio, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [caio, duda]);

    const sent = await db.sql<{ url: string; body: Array<Record<string, unknown>> }>(`select * from net.sent`);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    expect(sent[0]!.body).toEqual([
      {
        to: 'ExponentPushToken[duda_phone_0000000]',
        title: 'New follower',
        body: '@notif_caio started following you',
        sound: 'default',
        data: { url: '/notifications' },
      },
    ]);
  });

  it('quem não ativou o push não recebe nada', async () => {
    await db.sql(`delete from net.sent`);
    const p = await post(bia);
    await db.as(ana, `insert into public.likes (user_id, post_id) values ($1, $2)`, [ana, p]);
    expect(await db.sql(`select * from net.sent`)).toHaveLength(0);
  });
});

describe('notificações ao vivo (Realtime, canal privado)', () => {
  /**
   * O que chega para quem ouve `topic`: o servidor do Realtime só deixa entrar no canal se a
   * policy de realtime.messages permitir (com o canal em realtime.topic()) e entrega as
   * mensagens daquele canal.
   */
  async function listen(user: string, topic: string) {
    await db.sql('begin');
    try {
      await db.sql('set local role authenticated');
      await db.sql(`select set_config('request.jwt.claims', $1, true), set_config('realtime.topic', $2, true)`, [
        JSON.stringify({ sub: user, role: 'authenticated' }),
        topic,
      ]);
      return await db.sql<{ payload: Record<string, unknown>; event: string }>(`select payload, event from realtime.messages where topic = realtime.topic() order by inserted_at`);
    } finally {
      await db.sql('rollback');
    }
  }

  it('curtir avisa só o dono do post, sem dizer quem foi', async () => {
    await db.sql(`delete from realtime.messages`);
    const p = await post(ana);
    await db.as(caio, `insert into public.likes (user_id, post_id) values ($1, $2)`, [caio, p]);

    const forAna = await listen(ana, `user:${ana}`);
    expect(forAna).toEqual([{ event: 'notification', payload: { kind: 'like', post_id: p, removed: false } }]);
    expect(JSON.stringify(forAna)).not.toContain(caio);

    // Outra pessoa não ouve o canal da Ana, nem pedindo por ele.
    expect(await listen(bia, `user:${ana}`)).toEqual([]);
    expect(await listen(bia, `user:${bia}`)).toEqual([]);

    // Descurtir também avisa (o sino diminui).
    await db.as(caio, `delete from public.likes where user_id = $1 and post_id = $2`, [caio, p]);
    expect((await listen(ana, `user:${ana}`)).map((m) => m.payload.removed)).toEqual([false, true]);
  });

  it('seguir e comentar também avisam', async () => {
    await db.sql(`delete from realtime.messages`);
    await db.as(duda, `insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [duda, caio]);
    const p = await post(caio);
    await db.as(ana, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'boa')`, [p, ana]);
    const kinds = (await listen(caio, `user:${caio}`)).map((m) => m.payload.kind);
    expect(kinds).toEqual(expect.arrayContaining(['follow', 'comment']));
  });

  it('ninguém publica no canal de outra pessoa pelo app', async () => {
    await expect(
      db.as(bia, `insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'notification', '{}', true)`, [`user:${ana}`]),
    ).rejects.toThrow(/row-level security/);
  });

  it('scripts com a chave secreta (sem login) não geram aviso ao vivo', async () => {
    await db.sql(`delete from realtime.messages`);
    const p = await post(ana);
    await db.sql(`insert into public.likes (user_id, post_id) values ($1, $2)`, [duda, p]);
    expect(await listen(ana, `user:${ana}`)).toEqual([]);
  });
});
