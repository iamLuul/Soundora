import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let chato: string;
let admin: string;
let n = 0;

const BODY = 'Uma análise longa o bastante sobre o álbum, faixa a faixa.';

async function album(title = 'Álbum', year: string | null = '2007-09-11') {
  const [row] = await db.sql<{ id: string }>(
    `insert into public.link_previews (url, platform, kind, provider_id, title, artist, release_date)
     values ($1, 'deezer', 'album', $2, $3, 'Artista', $4) returning id`,
    [`https://www.deezer.com/album/rv${++n}`, String(n), title, year],
  );
  return row!.id;
}

const review = (author: string, albumId: string, rating: number | string = 9.1, body = BODY) =>
  db.as<{ id: string }>(author, `insert into public.album_reviews (author_id, album_id, rating, body) values ($1, $2, $3, $4) returning id`, [author, albumId, rating, body]);

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'rev_ana');
  bia = await createUser(db, 'rev_bia');
  chato = await createUser(db, 'rev_chato');
  admin = await createUser(db, 'rvw_mod');
  await db.sql(`insert into public.admins (user_id) values ($1)`, [admin]);
});
afterAll(async () => db.close());

describe('reviews de álbuns', () => {
  it('publica com nota de 0 a 10 (uma casa) e aparece na lista com o álbum e o ano', async () => {
    const a = await album('Graduation');
    const [r] = await review(ana, a, 9.1);
    const rows = await db.as<Record<string, unknown>>(bia, `select * from public.reviews_feed()`);
    const mine = rows.find((x) => x.id === r!.id)!;
    expect(mine).toMatchObject({ body: BODY, like_count: 0, liked_by_me: false, author_username: 'rev_ana', album_title: 'Graduation', album_artist: 'Artista', album_year: 2007 });
    expect(Number(mine.rating)).toBe(9.1);
  });

  it('precisa de álbum (música solta não vale), nota válida, texto de 20 a 5000 letras; uma por álbum', async () => {
    const track = await createPreview(db, 'https://open.spotify.com/track/rev0000000000000000001');
    await expect(review(ana, track)).rejects.toThrow(/review_needs_album/);
    const a = await album();
    await expect(review(ana, a, 10.5)).rejects.toThrow(/check/);
    await expect(review(ana, a, -1)).rejects.toThrow(/check/);
    await expect(review(ana, a, 8, 'curto demais')).rejects.toThrow(/check/);
    await expect(review(ana, a, 8, 'x'.repeat(5001))).rejects.toThrow(/check/);
    await review(ana, a, 0);
    await expect(review(ana, a, 7)).rejects.toThrow(/duplicate|unique/);
    // 9.15 vira 9.2 (uma casa).
    const b = await album();
    const [r] = await review(ana, b, 9.15);
    expect(Number((await db.sql<{ rating: string }>(`select rating from public.album_reviews where id = $1`, [r!.id]))[0]!.rating)).toBe(9.2);
  });

  it('só publica em nome próprio; só apaga a própria; o app não muda a nota nem as curtidas', async () => {
    const a = await album();
    await expect(db.as(ana, `insert into public.album_reviews (author_id, album_id, rating, body) values ($1, $2, 5, $3)`, [bia, a, BODY])).rejects.toThrow(/row-level security/);
    const [r] = await review(bia, a);
    await db.as(ana, `delete from public.album_reviews where id = $1`, [r!.id]);
    expect(await db.sql(`select id from public.album_reviews where id = $1`, [r!.id])).toHaveLength(1);
    await expect(db.as(bia, `update public.album_reviews set like_count = 999 where id = $1`, [r!.id])).rejects.toThrow(/permission denied/);
    await expect(db.as(bia, `insert into public.album_reviews (author_id, album_id, rating, body, like_count) values ($1, $2, 5, $3, 50)`, [bia, await album(), BODY])).rejects.toThrow(/permission denied/);
    await db.as(bia, `delete from public.album_reviews where id = $1`, [r!.id]);
    expect(await db.sql(`select id from public.album_reviews where id = $1`, [r!.id])).toEqual([]);
    await expect(db.anon(`select * from public.reviews_feed()`)).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.album_reviews`)).rejects.toThrow(/permission denied/);
  });

  it('curtir e descurtir mudam o contador; não curte por outra pessoa', async () => {
    const [r] = await review(ana, await album());
    await db.as(bia, `insert into public.review_likes (user_id, review_id) values ($1, $2)`, [bia, r!.id]);
    await expect(db.as(bia, `insert into public.review_likes (user_id, review_id) values ($1, $2)`, [ana, r!.id])).rejects.toThrow(/row-level security/);
    let row = (await db.as<{ id: string; like_count: number; liked_by_me: boolean }>(bia, `select * from public.reviews_feed()`)).find((x) => x.id === r!.id)!;
    expect(row).toMatchObject({ like_count: 1, liked_by_me: true });
    await db.as(bia, `delete from public.review_likes where user_id = $1 and review_id = $2`, [bia, r!.id]);
    row = (await db.as<{ id: string; like_count: number; liked_by_me: boolean }>(bia, `select * from public.reviews_feed()`)).find((x) => x.id === r!.id)!;
    expect(row).toMatchObject({ like_count: 0, liked_by_me: false });
  });

  it('bloqueio: não vê nem curte; filtros por pessoa e por álbum; páginas', async () => {
    const a = await album();
    const [r] = await review(chato, a);
    await db.as(ana, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [ana, chato]);
    expect((await db.as<{ id: string }>(ana, `select id from public.reviews_feed()`)).map((x) => x.id)).not.toContain(r!.id);
    await expect(db.as(ana, `insert into public.review_likes (user_id, review_id) values ($1, $2)`, [ana, r!.id])).rejects.toThrow(/row-level security/);
    expect((await db.as<{ id: string }>(chato, `select id from public.reviews_feed(null, null, 20, null, $1)`, [a])).map((x) => x.id)).toEqual([r!.id]);
    expect((await db.as<{ author_id: string }>(bia, `select author_id from public.reviews_feed(null, null, 50, $1)`, [ana])).every((x) => x.author_id === ana)).toBe(true);

    const page1 = await db.as<{ id: string; created_at: Date }>(bia, `select id, created_at from public.reviews_feed(null, null, 2)`);
    expect(page1).toHaveLength(2);
    const page2 = await db.as<{ id: string }>(bia, `select id from public.reviews_feed($1, $2, 50)`, [page1[1]!.created_at, page1[1]!.id]);
    expect(page2.map((x) => x.id)).not.toContain(page1[0]!.id);
    expect(page2.map((x) => x.id)).not.toContain(page1[1]!.id);
  });

  it('conta suspensa não publica nem curte', async () => {
    const [r] = await review(bia, await album());
    await db.as(admin, `select public.admin_suspend($1, 7)`, [chato]);
    await expect(review(chato, await album())).rejects.toThrow(/account_suspended/);
    await expect(db.as(chato, `insert into public.review_likes (user_id, review_id) values ($1, $2)`, [chato, r!.id])).rejects.toThrow(/account_suspended/);
    await db.as(admin, `select public.admin_suspend($1, 0)`, [chato]);
  });

  it('denúncia de review aparece no painel; remover apaga a review', async () => {
    const [r] = await review(chato, await album('Ruim'), 1, 'Texto ofensivo de exemplo para denúncia.');
    await db.as(bia, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'review', $2, 'hate')`, [bia, r!.id]);
    const open = await db.as<{ target_id: string; preview: string; author_username: string }>(admin, `select * from public.admin_reports('open')`);
    expect(open.find((x) => x.target_id === r!.id)).toMatchObject({ author_username: 'rev_chato' });
    expect(open.find((x) => x.target_id === r!.id)!.preview).toMatch(/^Ruim · 1\.0\/10 · Texto ofensivo/);
    const users = await db.as<{ open_reports: number }>(admin, `select * from public.admin_users('rev_chato')`);
    expect(users[0]!.open_reports).toBeGreaterThanOrEqual(1);
    await db.as(admin, `select public.admin_resolve('review', $1, 'remove')`, [r!.id]);
    expect(await db.sql(`select id from public.album_reviews where id = $1`, [r!.id])).toEqual([]);
  });
});
