import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let me: string;
let ana: string;
let chato: string;
let n = 0;

async function post(author: string, genres: string[], hoursAgo: number) {
  const preview = await createPreview(db, `https://open.spotify.com/track/genp${String(++n).padStart(18, '0')}`);
  const [row] = await db.sql<{ id: string }>(
    `insert into public.posts (author_id, link_preview_id, genres, created_at) values ($1, $2, $3, now() - make_interval(hours => $4)) returning id`,
    [author, preview, genres, hoursAgo],
  );
  return row!.id;
}

beforeAll(async () => {
  db = await connect();
  me = await createUser(db, 'genp_eu');
  ana = await createUser(db, 'genp_ana');
  chato = await createUser(db, 'genp_chato');
});
afterAll(async () => db.close());

describe('buscar por gênero', () => {
  it('lista os posts com o gênero, do mais novo ao mais velho, com páginas; sem bloqueados', async () => {
    const old = await post(ana, ['blackgaze', 'rock'], 30);
    const mid = await post(me, ['blackgaze'], 20);
    const recent = await post(ana, ['dream_pop', 'blackgaze'], 10);
    await post(ana, ['rock'], 5); // outro gênero
    const blocked = await post(chato, ['blackgaze'], 1);
    await db.as(me, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [me, chato]);

    type Row = { id: string; created_at: Date; genres: string[]; author_username: string };
    const page1 = await db.as<Row>(me, `select * from public.genre_posts('blackgaze', null, null, 2)`);
    expect(page1.map((r) => r.id)).toEqual([recent, mid]);
    expect(page1[0]!.genres).toEqual(['dream_pop', 'blackgaze']);
    const last = page1.at(-1)!;
    const page2 = await db.as<Row>(me, `select * from public.genre_posts('blackgaze', $1, $2, 2)`, [last.created_at, last.id]);
    expect(page2.map((r) => r.id)).toEqual([old]);
    expect([...page1, ...page2].map((r) => r.id)).not.toContain(blocked);

    // Quem não bloqueou vê o post.
    const anaView = await db.as<Row>(ana, `select id from public.genre_posts('blackgaze')`);
    expect(anaView.map((r) => r.id)).toContain(blocked);
  });

  it('gênero inexistente dá erro; sem login não usa', async () => {
    await expect(db.as(me, `select * from public.genre_posts('nao_existe_genero')`)).rejects.toThrow(/invalid_genre/);
    await expect(db.anon(`select * from public.genre_posts('rock')`)).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.search_post_genres('rock')`)).rejects.toThrow(/permission denied/);
  });

  it('a busca de gêneros mostra quantos posts cada um tem, os que têm posts primeiro', async () => {
    const rows = await db.as<{ slug: string; post_count: number }>(me, `select * from public.search_post_genres('blackga', 10)`);
    expect(rows[0]!.slug).toBe('blackgaze');
    expect(rows[0]!.post_count).toBe(4);
    const rock = await db.as<{ slug: string; post_count: number }>(me, `select * from public.search_post_genres('rock', 30)`);
    const withPosts = rock.filter((r) => r.post_count > 0).map((r) => r.slug);
    expect(rock.slice(0, withPosts.length).map((r) => r.slug)).toEqual(withPosts);
    expect(await db.as(me, `select * from public.search_post_genres('', 10)`)).toEqual([]);
  });
});

describe('buscar posts pela palavra', () => {
  it('acha posts com a palavra no texto (sem maiúsculas), mais novo primeiro, sem bloqueados', async () => {
    const a = await post(ana, [], 3);
    await db.sql(`update public.posts set body = 'Que show INCRIVEL ontem' where id = $1`, [a]);
    const b = await post(me, [], 2);
    await db.sql(`update public.posts set body = 'incrível não, incrivel mesmo' where id = $1`, [b]);
    const c = await post(chato, [], 1); // bloqueado (do teste acima)
    await db.sql(`update public.posts set body = 'post incrivel do chato' where id = $1`, [c]);
    const d = await post(ana, [], 1);
    await db.sql(`update public.posts set body = '100% puro_suco' where id = $1`, [d]);

    const rows = await db.as<{ id: string }>(me, `select id from public.search_posts('incrivel')`);
    expect(rows.map((r) => r.id)).toEqual([b, a]);
    // Sem acento: "incrível" acha "INCRIVEL" também.
    expect((await db.as<{ id: string }>(me, `select id from public.search_posts('Incrível')`)).map((r) => r.id)).toEqual([b, a]);
    const page2 = await db.as<{ id: string }>(me, `select id from public.search_posts('incrivel', now() - interval '150 minutes', null, 20)`);
    expect(page2.map((r) => r.id)).toEqual([a]);

    // % e _ são letras, não curingas.
    expect((await db.as<{ id: string }>(me, `select id from public.search_posts('0% p')`)).map((r) => r.id)).toEqual([d]);
    expect((await db.as<{ id: string }>(me, `select id from public.search_posts('o_s')`)).map((r) => r.id)).toEqual([d]);
    expect(await db.as(me, `select id from public.search_posts('r%c')`)).toEqual([]); // como curinga acharia "puro_suco"
    expect(await db.as(me, `select id from public.search_posts('pur_x')`)).toEqual([]);
    expect(await db.as(me, `select id from public.search_posts('i')`)).toEqual([]);
    await expect(db.anon(`select * from public.search_posts('incrivel')`)).rejects.toThrow(/permission denied/);
  });
});
