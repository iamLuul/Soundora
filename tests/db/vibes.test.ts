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

/** Simula o arquivo que a Edge Function media-upload gravou no bucket. */
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
  it('foto, vídeo, texto e post compartilhado', async () => {
    const photo = await stored(ana, 'jpg');
    const video = await stored(ana, 'mp4');
    const preview = await createPreview(db, 'https://open.spotify.com/track/vibe0000000000000000001', 'Música da vibe');
    const [p] = await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id, body) values ($1, $2, 'post da bia') returning id`, [bia, preview]);

    await create(ana, { kind: 'photo', media: photo, text: 'legenda' });
    await create(ana, { kind: 'video', media: video, duration: 12_000 });
    await create(ana, { kind: 'text', text: 'bom dia', style: 'pink' });
    await create(ana, { kind: 'post', post: p!.id });

    const rows = await vibesOf(caio, ana);
    expect(rows.map((r) => r.kind)).toEqual(['photo', 'video', 'text', 'post']);
    // O post compartilhado mostra o link que o autor do post colou.
    expect(rows[3]).toMatchObject({ post_author_username: 'vibe_bia', preview_title: 'Música da vibe' });
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

describe('posição do texto', () => {
  it('guarda onde a pessoa colocou o texto; fora da tela é recusado; sem texto não guarda posição', async () => {
    const [{ id }] = await db.as<{ id: string }>(ana, `select public.vibe_create(p_kind => 'text', p_text => 'aqui', p_text_x => 0.2, p_text_y => 0.15) as id`);
    const row = (await vibesOf(caio, ana)).find((v) => v.id === id) as unknown as { text_x: number; text_y: number };
    expect([row.text_x, row.text_y].map((n) => Math.round(n * 100) / 100)).toEqual([0.2, 0.15]);
    await expect(db.as(ana, `select public.vibe_create(p_kind => 'text', p_text => 'x', p_text_x => 1.5, p_text_y => 0.5)`)).rejects.toThrow(/check constraint/);
    await expect(db.as(ana, `select public.vibe_create(p_kind => 'text', p_text => 'x', p_text_x => 0.5)`)).rejects.toThrow(/vibes_text_position/);
  });
});

describe('vários textos', () => {
  const item = (t: string, extra: Record<string, unknown> = {}) => ({ t, x: 0.3, y: 0.4, f: 'classic', c: 'white', b: 'none', ...extra });
  const make = (user: string, items: unknown) => db.as<{ id: string }>(user, `select public.vibe_create(p_kind => 'text', p_text_items => $1::jsonb) as id`, [JSON.stringify(items)]);

  it('guarda cada texto com lugar, fonte, cor e fundo; o campo text junta os textos', async () => {
    const [{ id }] = await make(ana, [item('primeiro', { f: 'serif', c: 'yellow', b: 'solid' }), item('segundo', { x: 0.7, y: 0.8, f: 'typewriter', b: 'soft' })]);
    const [v] = await db.as<{ text: string; text_x: number | null; text_items: { t: string; f: string; c: string; b: string; x: number }[] }>(ana, `select * from public.vibes_of($1) where id = $2`, [ana, id]);
    expect(v!.text).toBe('primeiro\nsegundo');
    expect(v!.text_x).toBeNull();
    expect(v!.text_items.map((i) => [i.t, i.f, i.c, i.b, i.x])).toEqual([
      ['primeiro', 'serif', 'yellow', 'solid', 0.3],
      ['segundo', 'typewriter', 'white', 'soft', 0.7],
    ]);
  });

  it('recusa lista inválida: vazia, grande demais, fonte/cor/fundo fora da lista, posição fora da tela, campo extra', async () => {
    const bad: unknown[] = [
      [],
      Array.from({ length: 9 }, (_, i) => item(`t${i}`)),
      [item('x', { f: 'comic-sans' })],
      [item('x', { c: '#ff0000' })],
      [item('x', { b: 'neon' })],
      [item('x', { x: 1.5 })],
      [item('x', { y: -0.1 })],
      [item('   ')],
      [item('a'.repeat(301))],
      [item('x', { extra: 1 })],
      [item('a'.repeat(300)), item('b'.repeat(300)), item('c')],
      { t: 'não é lista' },
    ];
    for (const items of bad) await expect(make(ana, items)).rejects.toThrow(/invalid_text_items|vibes_text_items|violates check/);
  });

  it('o texto antigo (uma posição só) continua funcionando', async () => {
    const [{ id }] = await db.as<{ id: string }>(ana, `select public.vibe_create(p_kind => 'text', p_text => 'antigo', p_text_x => 0.2, p_text_y => 0.9) as id`);
    const [v] = await db.as<{ text_x: number; text_items: unknown }>(ana, `select * from public.vibes_of($1) where id = $2`, [ana, id]);
    expect([v!.text_x, v!.text_items]).toEqual([0.2, null]);
  });
});

describe('vibes no jeito dos Stories', () => {
  const item = (t: string, extra: Record<string, unknown> = {}) => ({ t, x: 0.5, y: 0.5, f: 'classic', c: 'white', b: 'none', ...extra });
  const make = (user: string, items: unknown) => db.as<{ id: string }>(user, `select public.vibe_create(p_kind => 'text', p_text_items => $1::jsonb) as id`, [JSON.stringify(items)]);

  it('nenhuma vibe leva música: nem o tipo música, nem música por cima de foto, vídeo, texto ou post', async () => {
    const preview = await createPreview(db, 'https://open.spotify.com/track/vibestory0000000000001', 'Trilha');
    const [p] = await db.sql<{ id: string }>(`insert into public.posts (author_id, link_preview_id, body) values ($1, $2, 'x') returning id`, [bia, preview]);
    for (const args of [
      { kind: 'music', preview },
      { kind: 'photo', media: await stored(ana, 'jpg'), preview },
      { kind: 'video', media: await stored(ana, 'mp4'), duration: 5000, preview },
      { kind: 'text', text: 'com música', preview },
      { kind: 'post', post: p!.id, preview },
    ])
      await expect(create(ana, args)).rejects.toThrow(/check constraint/);
  });

  it('texto com tamanho, giro e alinhamento (opcionais); fora dos limites é recusado', async () => {
    const [{ id }] = await make(ana, [item('grande', { s: 2.5, r: -30, a: 'left' }), item('normal')]);
    const [v] = await db.as<{ text_items: { s?: number; r?: number; a?: string }[] }>(ana, `select * from public.vibes_of($1) where id = $2`, [ana, id]);
    expect(v!.text_items[0]).toMatchObject({ s: 2.5, r: -30, a: 'left' });
    expect(v!.text_items[1]!.s).toBeUndefined();
    for (const extra of [{ s: 0.1 }, { s: 5 }, { s: '2' }, { r: 200 }, { r: -181 }, { a: 'justify' }, { a: 1 }])
      await expect(make(ana, [item('x', extra)])).rejects.toThrow(/invalid_text_items|vibes_text_items|violates check/);
  });
});
