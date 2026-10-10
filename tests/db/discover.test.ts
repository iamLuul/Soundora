import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let me: string;
let followed: string;
let other1: string;
let other2: string;
let blocked: string;
let admin: string;

let n = 0;
async function preview(title: string, artist = 'Artista') {
  n += 1;
  const id = await createPreview(db, `https://www.deezer.com/track/${900000 + n}`, title);
  await db.sql(`update public.link_previews set artist = $2 where id = $1`, [id, artist]);
  return id;
}

async function post(author: string, previewId: string, opts: { genre?: string; daysAgo?: number; likes?: number } = {}) {
  const [row] = await db.sql<{ id: string }>(
    `insert into public.posts (author_id, link_preview_id, genre, created_at, like_count)
     values ($1, $2, $3, now() - make_interval(days => $4), $5) returning id`,
    [author, previewId, opts.genre ?? null, opts.daysAgo ?? 0, opts.likes ?? 0],
  );
  return row!.id;
}

beforeAll(async () => {
  db = await connect();
  me = await createUser(db, 'discme', { genres: ['shoegaze', 'jazz', 'mpb'] });
  followed = await createUser(db, 'discfollowed');
  other1 = await createUser(db, 'discother1');
  other2 = await createUser(db, 'discother2');
  blocked = await createUser(db, 'discblocked');
  admin = await createUser(db, 'discadmin');
  await db.sql(`insert into public.admins values ($1)`, [admin]);
  await db.as(me, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, followed]);
  await db.as(me, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [me, blocked]);
});
afterAll(async () => db.close());

describe('curadoria (featured)', () => {
  it('só administradores criam destaques', async () => {
    const p = await preview('Destaque negado');
    await expect(db.as(me, `insert into public.featured (link_preview_id) values ($1)`, [p])).rejects.toThrow(/row-level security/);
    await db.as(admin, `insert into public.featured (link_preview_id, note_pt, note_en) values ($1, 'escolha da casa', 'staff pick')`, [p]);
    const rows = await db.as(me, `select note_pt from public.featured where link_preview_id = $1`, [p]);
    expect(rows).toEqual([{ note_pt: 'escolha da casa' }]);
  });

  it('destaque vencido ou futuro não aparece para quem não é admin', async () => {
    const p = await preview('Destaque fora da janela');
    await db.as(admin, `insert into public.featured (link_preview_id, starts_at) values ($1, now() + interval '1 day')`, [p]);
    expect(await db.as(me, `select 1 from public.featured where link_preview_id = $1`, [p])).toEqual([]);
    expect(await db.as(admin, `select 1 from public.featured where link_preview_id = $1`, [p])).toHaveLength(1);
  });
});

describe('discover_cards', () => {
  it('traz destaques primeiro, depois a comunidade no meu gênero, sem repetir nem mostrar o que não deve', async () => {
    const mine = await preview('Minha');
    await post(me, mine, { genre: 'shoegaze' });
    const fromFollowed = await preview('Do seguido');
    await post(followed, fromFollowed, { genre: 'shoegaze' });
    const fromBlocked = await preview('Do bloqueado');
    await post(blocked, fromBlocked, { genre: 'shoegaze' });
    const otherGenre = await preview('Outro gênero');
    await post(other1, otherGenre, { genre: 'metal' });
    const tooOld = await preview('Antiga');
    await post(other1, tooOld, { genre: 'jazz', daysAgo: 40 });
    const popular = await preview('Popular');
    await post(other1, popular, { genre: 'jazz', likes: 50 });
    const quiet = await preview('Quieta');
    await post(other2, quiet, { genre: 'mpb', likes: 0, daysAgo: 5 });

    const rows = await db.as<{ title: string; source: string; note: string | null; recommender_username: string | null }>(
      me,
      `select title, source, note, recommender_username from public.discover_cards(50)`,
    );
    const titles = rows.map((r) => r.title);

    expect(rows[0]).toMatchObject({ title: 'Destaque negado', source: 'featured', note: 'escolha da casa' });
    expect(titles).not.toContain('Destaque fora da janela');
    expect(titles.indexOf('Popular')).toBeLessThan(titles.indexOf('Quieta'));
    expect(rows.find((r) => r.title === 'Popular')).toMatchObject({ source: 'community', recommender_username: 'discother1' });
    for (const hidden of ['Minha', 'Do seguido', 'Do bloqueado', 'Outro gênero', 'Antiga']) expect(titles).not.toContain(hidden);
  });

  it('a nota do destaque segue o idioma do perfil', async () => {
    await db.sql(`update public.profiles set locale = 'en' where id = $1`, [me]);
    const [first] = await db.as<{ note: string }>(me, `select note from public.discover_cards(1)`);
    expect(first!.note).toBe('staff pick');
    await db.sql(`update public.profiles set locale = 'pt-BR' where id = $1`, [me]);
  });

  it('swipe tira a música do Descobrir; swipe para a direita curte o post de origem', async () => {
    const cards = await db.as<{ link_preview_id: string; post_id: string | null; title: string }>(me, `select * from public.discover_cards(50)`);
    const popular = cards.find((c) => c.title === 'Popular')!;
    await db.as(me, `select public.discover_swipe($1, true, $2)`, [popular.link_preview_id, popular.post_id]);
    const featured = cards.find((c) => c.title === 'Destaque negado')!;
    await db.as(me, `select public.discover_swipe($1, false, null)`, [featured.link_preview_id]);

    const after = (await db.as<{ title: string }>(me, `select title from public.discover_cards(50)`)).map((r) => r.title);
    expect(after).not.toContain('Popular');
    expect(after).not.toContain('Destaque negado');
    expect(await db.sql(`select 1 from public.likes where user_id = $1 and post_id = $2`, [me, popular.post_id])).toHaveLength(1);
  });

  it('não registra swipe em nome de outra pessoa', async () => {
    const p = await preview('Alheia');
    await expect(
      db.as(me, `insert into public.discover_swipes (user_id, link_preview_id, liked) values ($1, $2, true)`, [other1, p]),
    ).rejects.toThrow(/row-level security/);
  });

  it('é só para quem está logado', async () => {
    await expect(db.anon(`select * from public.discover_cards(5)`)).rejects.toThrow(/permission denied/);
  });
});

describe('trending_tracks', () => {
  it('ordena por posts (cada pessoa conta uma vez) e curtidas, e filtra por gênero', async () => {
    const hit = await preview('Hit da semana', 'Banda X');
    await post(other1, hit, { genre: 'pop', likes: 2 });
    await post(other1, hit, { genre: 'pop', likes: 1 }); // mesma pessoa de novo: não conta como novo post
    await post(other2, hit, { genre: 'pop', likes: 0 });
    const runnerUp = await preview('Segunda', 'Banda Y');
    await post(other2, runnerUp, { genre: 'pop', likes: 4 });
    const old = await preview('Velha', 'Banda Z');
    await post(other1, old, { genre: 'pop', likes: 99, daysAgo: 10 });

    const rows = await db.as<{ rank: number; title: string; post_count: number; like_count: number }>(
      me,
      `select rank, title, post_count, like_count from public.trending_tracks(7, 'pop', 10)`,
    );
    expect(rows.map((r) => r.title)).toEqual(['Hit da semana', 'Segunda']);
    expect(rows[0]).toMatchObject({ rank: 1, post_count: 2, like_count: 3 });
  });

  it('esconde músicas postadas só por bloqueados', async () => {
    const b = await preview('Só do bloqueado');
    await post(blocked, b, { genre: 'pop', likes: 500 });
    const titles = (await db.as<{ title: string }>(me, `select title from public.trending_tracks(7, null, 100)`)).map((r) => r.title);
    expect(titles).not.toContain('Só do bloqueado');
  });
});

describe('search_tracks', () => {
  it('acha por título ou artista, tolerando erro de digitação', async () => {
    const byTitle = await db.as<{ title: string }>(me, `select title from public.search_tracks('hit da semna')`);
    expect(byTitle.map((r) => r.title)).toContain('Hit da semana');
    const byArtist = await db.as<{ title: string; post_count: number }>(me, `select title, post_count from public.search_tracks('Banda Y')`);
    expect(byArtist[0]).toMatchObject({ title: 'Segunda', post_count: 1 });
  });

  it('ignora consultas curtas demais', async () => {
    expect(await db.as(me, `select * from public.search_tracks('a')`)).toEqual([]);
  });
});
