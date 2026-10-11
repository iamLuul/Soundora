import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let caio: string;
let blocked: string;

interface Tray {
  username: string;
  vibe_count: number;
  unseen: boolean;
  is_me: boolean;
}
interface VibeRow {
  id: string;
  kind: string;
  text: string | null;
  seen: boolean;
  view_count: number | null;
  preview_title: string | null;
  post_author_username: string | null;
  media_path: string | null;
}

/** Simula o arquivo que a Edge Function vibe-media gravou no bucket. */
async function stored(owner: string, ext: 'jpg' | 'mp4', hoursAgo = 0) {
  const name = `${owner}/${crypto.randomUUID()}.${ext}`;
  await db.sql(`insert into storage.objects (bucket_id, name, created_at) values ('vibes', $1, now() - make_interval(hours => $2))`, [name, hoursAgo]);
  return name;
}

const create = (user: string, args: Record<string, unknown>) =>
  db.as<{ id: string }>(
    user,
    `select public.vibe_create(p_kind => $1, p_media_path => $2, p_duration_ms => $3, p_text => $4, p_style => $5, p_link_preview_id => $6, p_post_id => $7) as id`,
    [args.kind, args.media ?? null, args.duration ?? null, args.text ?? null, args.style ?? 'violet', args.preview ?? null, args.post ?? null],
  ).then((r) => r[0]!.id);

const tray = (user: string) => db.as<Tray>(user, `select * from public.vibes_tray()`);
const vibesOf = (user: string, author: string) => db.as<VibeRow>(user, `select * from public.vibes_of($1)`, [author]);

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'vibe_ana');
  bia = await createUser(db, 'vibe_bia');
  caio = await createUser(db, 'vibe_caio');
  blocked = await createUser(db, 'vibe_blocked');
  await db.as(bia, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [bia, ana]);
  await db.as(bia, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [bia, blocked]);
  await db.as(blocked, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [blocked, bia]);
});
afterAll(async () => db.close());

describe('criar vibes', () => {
  it('foto, vídeo, texto, música e post compartilhado', async () => {
    const photo = await stored(ana, 'jpg');
    const video = await stored(ana, 'mp4');
    const preview = await createPreview(db, 'https://open.spotify.com/track/vibe0000000000000000001', 'Música da vibe');
    const [p] = await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id, body) values ($1, $2, 'post da bia') returning id`, [bia, preview]);

    await create(ana, { kind: 'photo', media: photo, text: 'legenda' });
    await create(ana, { kind: 'video', media: video, duration: 12_000 });
    await create(ana, { kind: 'text', text: 'bom dia', style: 'pink' });
    await create(ana, { kind: 'music', preview });
    await create(ana, { kind: 'post', post: p!.id });

    const rows = await vibesOf(caio, ana);
    expect(rows.map((r) => r.kind)).toEqual(['photo', 'video', 'text', 'music', 'post']);
    expect(rows[3]!.preview_title).toBe('Música da vibe');
    expect(rows[4]).toMatchObject({ post_author_username: 'vibe_bia', preview_title: 'Música da vibe' });
    // Quem não é o autor não vê a contagem de visualizações.
    expect(rows.every((r) => r.view_count === null)).toBe(true);
  });

  it('recusa conteúdo inválido para o tipo', async () => {
    await expect(create(ana, { kind: 'text', text: '   ' })).rejects.toThrow(/check constraint/);
    await expect(create(ana, { kind: 'photo' })).rejects.toThrow(/check constraint/);
    await expect(create(ana, { kind: 'video', media: await stored(ana, 'mp4') })).rejects.toThrow(/check constraint/);
    await expect(create(ana, { kind: 'photo', media: await stored(ana, 'mp4') })).rejects.toThrow(/check constraint/);
    await expect(create(ana, { kind: 'text', text: 'x'.repeat(301) })).rejects.toThrow(/check constraint/);
  });

  it('mídia: só um arquivo meu, que passou pela Edge Function e ainda não foi usado', async () => {
    const other = await stored(bia, 'jpg');
    await expect(create(ana, { kind: 'photo', media: other })).rejects.toThrow(/invalid_media/);
    await expect(create(ana, { kind: 'photo', media: `${ana}/${crypto.randomUUID()}.jpg` })).rejects.toThrow(/invalid_media/);
    const mine = await stored(ana, 'jpg');
    await create(ana, { kind: 'photo', media: mine });
    await expect(create(ana, { kind: 'photo', media: mine })).rejects.toThrow(/invalid_media/);
  });

  it('não dá para compartilhar post de quem tem bloqueio comigo', async () => {
    const preview = await createPreview(db, 'https://open.spotify.com/track/vibe0000000000000000002');
    const [p] = await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id) values ($1, $2) returning id`, [blocked, preview]);
    await expect(create(bia, { kind: 'post', post: p!.id })).rejects.toThrow(/not_found/);
  });

  it('a tabela é fechada: nada de ler ou criar direto', async () => {
    await expect(db.as(ana, `select * from public.vibes`)).rejects.toThrow(/permission denied/);
    await expect(db.as(ana, `insert into public.vibes (author_id, kind, text) values ($1, 'text', 'x')`, [ana])).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.vibes_tray()`)).rejects.toThrow(/permission denied/);
  });
});

describe('ver vibes', () => {
  it('fila: eu primeiro, depois quem eu sigo; quem tem bloqueio não aparece', async () => {
    await create(bia, { kind: 'text', text: 'oi' });
    await create(blocked, { kind: 'text', text: 'não deveria aparecer' });
    const rows = await tray(bia);
    expect(rows.map((r) => r.username)).toEqual(['vibe_bia', 'vibe_ana']);
    expect(rows[0]).toMatchObject({ is_me: true, unseen: false });
    expect(rows[1]).toMatchObject({ unseen: true });
    expect(await vibesOf(bia, blocked)).toHaveLength(0);
  });

  it('marcar como vista: some o "não vista" e o autor vê quem viu', async () => {
    for (const v of await vibesOf(bia, ana)) {
      await db.as(bia, `select public.vibe_mark_seen($1)`, [v.id]);
    }
    expect((await tray(bia)).find((r) => r.username === 'vibe_ana')).toMatchObject({ unseen: false });

    const mine = await vibesOf(ana, ana);
    expect(mine[0]!.view_count).toBe(1);
    const viewers = await db.as<{ username: string }>(ana, `select * from public.vibe_viewers($1)`, [mine[0]!.id]);
    expect(viewers.map((v) => v.username)).toEqual(['vibe_bia']);
    // Outra pessoa não consegue ver quem viu a vibe da Ana.
    expect(await db.as(caio, `select * from public.vibe_viewers($1)`, [mine[0]!.id])).toHaveLength(0);
  });

  it('some depois de 24 horas', async () => {
    const id = await create(caio, { kind: 'text', text: 'antiga' });
    await db.sql(`update public.vibes set created_at = now() - interval '25 hours' where id = $1`, [id]);
    expect(await vibesOf(ana, caio)).toHaveLength(0);
  });

  it('mídia no Storage: abre só com a vibe ativa e sem bloqueio', async () => {
    const photo = await stored(blocked, 'jpg');
    await create(blocked, { kind: 'photo', media: photo });
    const canSee = async (user: string) =>
      (await db.as(user, `select name from storage.objects where bucket_id = 'vibes' and name = $1`, [photo])).length === 1;
    expect(await canSee(caio)).toBe(true);
    expect(await canSee(bia)).toBe(false); // bloqueio
    await db.sql(`update public.vibes set created_at = now() - interval '25 hours' where media_path = $1`, [photo]);
    expect(await canSee(caio)).toBe(false); // vencida
  });

  it('apagar: só a própria', async () => {
    const id = await create(caio, { kind: 'text', text: 'apagar' });
    await db.as(ana, `select public.vibe_delete($1)`, [id]);
    expect((await vibesOf(caio, caio)).some((v) => v.id === id)).toBe(true);
    await db.as(caio, `select public.vibe_delete($1)`, [id]);
    expect((await vibesOf(caio, caio)).some((v) => v.id === id)).toBe(false);
  });

  it('denunciar uma vibe', async () => {
    const [v] = await vibesOf(caio, ana);
    await db.as(caio, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'vibe', $2, 'spam')`, [caio, v!.id]);
  });
});

describe('limpeza da mídia', () => {
  it('lista arquivos vencidos, apagados ou nunca usados (com 1 h de folga)', async () => {
    const used = await stored(caio, 'jpg', 2);
    await create(caio, { kind: 'photo', media: used });
    const orphan = await stored(caio, 'jpg', 2);
    const fresh = await stored(caio, 'jpg', 0);
    const expiredFile = await stored(caio, 'jpg', 30);
    const expiredId = await create(caio, { kind: 'photo', media: expiredFile });
    await db.sql(`update public.vibes set created_at = now() - interval '30 hours' where id = $1`, [expiredId]);

    const rows = await db.sql<{ name: string }>(`select * from public.vibe_media_garbage($1)`, [caio]);
    const names = rows.map((r) => r.name);
    expect(names).toContain(orphan);
    expect(names).toContain(expiredFile);
    expect(names).not.toContain(used);
    expect(names).not.toContain(fresh);
    await expect(db.as(caio, `select * from public.vibe_media_garbage($1)`, [caio])).rejects.toThrow(/permission denied/);
  });
});
