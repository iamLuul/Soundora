import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let caio: string;
let duda: string;
let blocked: string;

interface Inbox {
  conversation_id: string;
  username: string;
  last_body: string | null;
  last_from_me: boolean;
  unread: boolean;
  last_vibe_reply: boolean;
  last_unsent: boolean;
}
interface Msg {
  id: string;
  from_me: boolean;
  body: string | null;
  liked: boolean;
  unsent: boolean;
  vibe_reply: boolean;
  vibe_id: string | null;
  vibe_text: string | null;
}

const send = (from: string, body: string, opts: { to?: string; conv?: string; vibe?: string } = {}) =>
  db
    .as<{ conversation_id: string; message_id: string }>(from, `select * from public.dm_send($1, $2, $3, $4)`, [body, opts.to ?? null, opts.conv ?? null, opts.vibe ?? null])
    .then((r) => r[0]!);
const inbox = (user: string, requests = false) => db.as<Inbox>(user, `select * from public.dm_inbox($1)`, [requests]);
const messages = (user: string, conv: string) => db.as<Msg>(user, `select * from public.dm_messages($1)`, [conv]);
const unread = (user: string) => db.as<{ unread: number; requests: number }>(user, `select * from public.dm_unread_count()`).then((r) => r[0]!);

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'dm_ana');
  bia = await createUser(db, 'dm_bia');
  caio = await createUser(db, 'dm_caio');
  duda = await createUser(db, 'dm_duda');
  blocked = await createUser(db, 'dm_blocked');
  // Bia segue a Ana: mensagem da Ana chega direto na lista da Bia.
  await db.sql(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [bia, ana]);
  await db.sql(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [blocked, ana]);
});
afterAll(async () => db.close());

describe('mensagens diretas', () => {
  it('quem segue recebe direto; quem não segue recebe como pedido', async () => {
    const { conversation_id: c1 } = await send(ana, 'oi bia', { to: bia });
    expect((await inbox(bia)).map((r) => [r.username, r.last_body, r.unread])).toEqual([['dm_ana', 'oi bia', true]]);
    expect(await unread(bia)).toEqual({ unread: 1, requests: 0 });

    const { conversation_id: c2 } = await send(ana, 'oi caio', { to: caio });
    expect(await inbox(caio)).toEqual([]);
    expect((await inbox(caio, true)).map((r) => r.conversation_id)).toEqual([c2]);
    expect(await unread(caio)).toEqual({ unread: 0, requests: 1 });

    // Mandar de novo para a mesma pessoa usa a mesma conversa.
    expect((await send(ana, 'tudo bem?', { to: bia })).conversation_id).toBe(c1);
    expect((await inbox(ana)).map((r) => r.username).sort()).toEqual(['dm_bia', 'dm_caio']);
  });

  it('"Visto" só depois que o pedido é aceito; responder aceita', async () => {
    const [{ id: conv }] = await db.as<{ id: string }>(ana, `select public.dm_find($1) as id`, [caio]);
    await db.as(caio, `select public.dm_mark_read($1)`, [conv]);
    const [before] = await db.as<{ their_last_read_at: string | null; accepted: boolean }>(ana, `select * from public.dm_conversation($1)`, [conv]);
    expect(before!.their_last_read_at).toBeNull();
    await send(caio, 'opa', { conv });
    expect((await inbox(caio)).map((r) => r.conversation_id)).toEqual([conv]);
    await db.as(caio, `select public.dm_mark_read($1)`, [conv]);
    const [after] = await db.as<{ their_last_read_at: string | null }>(ana, `select * from public.dm_conversation($1)`, [conv]);
    expect(after!.their_last_read_at).not.toBeNull();
  });

  it('ninguém de fora lê nem escreve na conversa; tabelas fechadas', async () => {
    const [{ id: conv }] = await db.as<{ id: string }>(ana, `select public.dm_find($1) as id`, [bia]);
    expect(await messages(duda, conv)).toEqual([]);
    expect(await db.as(duda, `select * from public.dm_conversation($1)`, [conv])).toEqual([]);
    await expect(send(duda, 'invadindo', { conv })).rejects.toThrow(/not_found/);
    await expect(db.as(duda, `select public.dm_delete($1)`, [conv])).rejects.toThrow(/not_found/);
    await expect(db.as(duda, `select public.dm_accept($1)`, [conv])).rejects.toThrow(/not_found/);
    for (const table of ['conversations', 'conversation_members', 'messages'])
      await expect(db.as(ana, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    await expect(db.as(ana, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [conv, ana])).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.dm_inbox()`)).rejects.toThrow(/permission denied/);
  });

  it('bloqueio: não manda, e a conversa some', async () => {
    await expect(send(ana, 'oi', { to: blocked })).rejects.toThrow(/not_found/);
    await expect(send(blocked, 'oi', { to: ana })).rejects.toThrow(/not_found/);
    const { conversation_id: conv } = await send(duda, 'oi ana', { to: ana });
    await db.sql(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [ana, duda]);
    expect((await inbox(ana, true)).map((r) => r.conversation_id)).not.toContain(conv);
    expect(await messages(ana, conv)).toEqual([]);
    await expect(send(duda, 'de novo', { conv })).rejects.toThrow(/not_found/);
    await db.sql(`delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [ana, duda]);
  });

  it('recusa texto vazio, longo demais, para si mesmo e de conta suspensa', async () => {
    await expect(send(ana, '   ', { to: bia })).rejects.toThrow(/invalid_request/);
    await expect(send(ana, 'x'.repeat(1001), { to: bia })).rejects.toThrow(/invalid_request/);
    await expect(send(ana, 'eu', { to: ana })).rejects.toThrow(/invalid_request/);
    await db.sql(`update public.profiles set suspended_until = 'infinity' where id = $1`, [duda]);
    await expect(send(duda, 'oi', { to: bia })).rejects.toThrow(/account_suspended/);
    await db.sql(`update public.profiles set suspended_until = null where id = $1`, [duda]);
  });

  it('curtir só mensagem recebida; desfazer só a própria (o texto sai do banco)', async () => {
    const [{ id: conv }] = await db.as<{ id: string }>(ana, `select public.dm_find($1) as id`, [bia]);
    const { message_id } = await send(ana, 'curte aí', { conv });
    await expect(db.as(ana, `select public.dm_like($1, true)`, [message_id])).rejects.toThrow(/not_found/);
    await db.as(bia, `select public.dm_like($1, true)`, [message_id]);
    expect((await messages(ana, conv)).find((m) => m.id === message_id)?.liked).toBe(true);

    await expect(db.as(bia, `select public.dm_unsend($1)`, [message_id])).rejects.toThrow(/not_found/);
    await db.as(ana, `select public.dm_unsend($1)`, [message_id]);
    const m = (await messages(bia, conv)).find((x) => x.id === message_id)!;
    expect([m.body, m.unsent, m.liked]).toEqual([null, true, false]);
    const [row] = await db.sql<{ body: string | null }>(`select body from public.messages where id = $1`, [message_id]);
    expect(row!.body).toBeNull();
  });

  it('apagar a conversa some só para mim; mensagem nova traz de volta', async () => {
    const [{ id: conv }] = await db.as<{ id: string }>(ana, `select public.dm_find($1) as id`, [bia]);
    await db.as(bia, `select public.dm_delete($1)`, [conv]);
    expect((await inbox(bia)).map((r) => r.conversation_id)).not.toContain(conv);
    expect((await inbox(ana)).map((r) => r.conversation_id)).toContain(conv);
    await send(ana, 'voltei', { conv });
    expect((await messages(bia, conv)).map((m) => m.body)).toEqual(['voltei']);
  });

  it('responder vibe: só vibe ativa de quem recebe; a vibe some quando vence', async () => {
    const [{ id: vibe }] = await db.as<{ id: string }>(bia, `select public.vibe_create(p_kind => 'text', p_text => 'minha vibe') as id`);
    const { conversation_id: conv, message_id } = await send(ana, 'amei', { to: bia, vibe });
    const m = (await messages(bia, conv)).find((x) => x.id === message_id)!;
    expect([m.vibe_reply, m.vibe_id, m.vibe_text]).toEqual([true, vibe, 'minha vibe']);
    expect((await inbox(bia))[0]!.last_vibe_reply).toBe(true);

    // Vibe de outra pessoa (não de quem recebe): recusada.
    await expect(send(caio, 'oi', { to: ana, vibe })).rejects.toThrow(/not_found/);
    // Venceu: a mensagem continua, sem a vibe.
    await db.sql(`update public.vibes set created_at = now() - interval '2 days' where id = $1`, [vibe]);
    const old = (await messages(bia, conv)).find((x) => x.id === message_id)!;
    expect([old.vibe_reply, old.vibe_id, old.body]).toEqual([true, null, 'amei']);
    await expect(send(ana, 'de novo', { to: bia, vibe })).rejects.toThrow(/not_found/);
  });

  it('limite de mensagens', async () => {
    const spam = await createUser(db, 'dm_spam');
    await db.sql(`insert into private.rate_events (user_id, action) select $1, 'dm' from generate_series(1, 60)`, [spam]);
    await expect(send(spam, 'oi', { to: ana })).rejects.toThrow(/rate_limited/);
  });

  it('aviso ao vivo leva só o id da conversa, no canal de quem recebe', async () => {
    await db.sql(`delete from realtime.messages`);
    const { conversation_id } = await send(caio, 'ao vivo', { to: ana });
    const rows = await db.sql<{ topic: string; event: string; payload: Record<string, unknown> }>(`select topic, event, payload from realtime.messages`);
    expect(rows).toEqual([{ topic: `user:${ana}`, event: 'dm', payload: { conversation_id } }]);
  });
});
