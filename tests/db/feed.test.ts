import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let me: string;
let friend: string;
let stranger: string;
let blocked: string;

async function post(author: string, opts: { hoursAgo?: number; genre?: string; title?: string } = {}) {
  const preview = await createPreview(db, `https://open.spotify.com/track/${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`, opts.title);
  const [row] = await db.sql<{ id: string }>(
    `insert into public.posts (author_id, link_preview_id, genre, created_at) values ($1, $2, $3, now() - make_interval(hours => $4)) returning id`,
    [author, preview, opts.genre ?? null, opts.hoursAgo ?? 1],
  );
  return row!.id;
}

beforeAll(async () => {
  db = await connect();
  me = await createUser(db, 'feedme', { genres: ['shoegaze', 'lo_fi', 'jazz'] });
  friend = await createUser(db, 'feedfriend');
  stranger = await createUser(db, 'feedstranger');
  blocked = await createUser(db, 'feedblocked');
  await db.as(me, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, friend]);
  await db.as(me, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [me, blocked]);
});
afterAll(async () => db.close());

describe('feed_for_you', () => {
  it('prioriza quem eu sigo e o meu gênero, esconde bloqueados e posts antigos', async () => {
    const friendPost = await post(friend, { hoursAgo: 3, title: 'do amigo' });
    const genrePost = await post(stranger, { hoursAgo: 3, genre: 'shoegaze', title: 'shoegaze' });
    const plainPost = await post(stranger, { hoursAgo: 3, title: 'aleatório' });
    const blockedPost = await post(blocked, { hoursAgo: 1, title: 'bloqueado' });
    const oldPost = await post(friend, { hoursAgo: 24 * 15, title: 'velho' });

    const rows = await db.as<{ id: string; preview_title: string; author_username: string }>(me, `select * from public.feed_for_you(50, 0)`);
    const ids = rows.map((r) => r.id);

    expect(ids.indexOf(friendPost)).toBeLessThan(ids.indexOf(genrePost));
    expect(ids.indexOf(genrePost)).toBeLessThan(ids.indexOf(plainPost));
    expect(ids).not.toContain(blockedPost);
    expect(ids).not.toContain(oldPost);
    expect(rows.find((r) => r.id === friendPost)).toMatchObject({ preview_title: 'do amigo', author_username: 'feedfriend' });
  });

  it('marca o que eu curti', async () => {
    const p = await post(friend, { hoursAgo: 1 });
    await db.as(me, `insert into public.likes (user_id, post_id) values ($1, $2)`, [me, p]);
    const rows = await db.as<{ id: string; liked_by_me: boolean }>(me, `select id, liked_by_me from public.feed_for_you(50, 0)`);
    expect(rows.find((r) => r.id === p)?.liked_by_me).toBe(true);
  });

  it('pagina sem repetir itens', async () => {
    const page1 = await db.as<{ id: string }>(me, `select id from public.feed_for_you(2, 0, now())`);
    const page2 = await db.as<{ id: string }>(me, `select id from public.feed_for_you(2, 2, now())`);
    expect(page1).toHaveLength(2);
    expect(page2.some((r) => page1.some((p) => p.id === r.id))).toBe(false);
  });

  it('é só para quem está logado', async () => {
    await expect(db.anon(`select * from public.feed_for_you(10, 0)`)).rejects.toThrow(/permission denied/);
  });
});

describe('perfil e busca', () => {
  it('profile_summary traz contadores e se eu sigo', async () => {
    const [s] = await db.as(me, `select * from public.profile_summary('feedfriend')`);
    expect(s).toMatchObject({ username: 'feedfriend', followers: 1, is_me: false, i_follow: true });
  });

  it('profile_summary de bloqueado vem vazio', async () => {
    expect(await db.as(me, `select * from public.profile_summary('feedblocked')`)).toEqual([]);
  });

  it('busca tolera erro de digitação e ignora bloqueados', async () => {
    const rows = await db.as<{ username: string }>(me, `select username from public.search_profiles('feedfrend')`);
    expect(rows.map((r) => r.username)).toContain('feedfriend');
    const blockedRows = await db.as<{ username: string }>(me, `select username from public.search_profiles('feedblocked')`);
    expect(blockedRows.map((r) => r.username)).not.toContain('feedblocked');
  });

  it('profile_posts pagina por data', async () => {
    const rows = await db.as<{ created_at: Date }>(me, `select created_at from public.profile_posts($1, null, null, 50)`, [friend]);
    const sorted = [...rows].sort((a, b) => +b.created_at - +a.created_at);
    expect(rows).toEqual(sorted);
  });

  it('profile_posts não perde posts com o mesmo horário na virada da página', async () => {
    const author = await createUser(db, 'feedempate');
    const preview = await createPreview(db, 'https://open.spotify.com/track/empate');
    // 5 posts com exatamente o mesmo created_at.
    await db.sql(
      `insert into public.posts (author_id, body, link_preview_id, created_at)
       select $1, 'p' || g, $2, '2026-10-01T12:00:00Z' from generate_series(1, 5) g`,
      [author, preview],
    );
    const seen: string[] = [];
    let cursor: { created_at: Date; id: string } | null = null;
    for (let i = 0; i < 5; i++) {
      const page: { id: string; created_at: Date }[] = await db.as(
        me,
        `select id, created_at from public.profile_posts($1, $2, $3, 2)`,
        [author, cursor?.created_at ?? null, cursor?.id ?? null],
      );
      if (!page.length) break;
      seen.push(...page.map((p) => p.id));
      cursor = page[page.length - 1]!;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe('feed_for_you com instante fixo', () => {
  it('posts criados depois de abrir o feed não entram nas páginas seguintes', async () => {
    const opened = new Date(Date.now() - 60_000).toISOString(); // feed aberto há 1 minuto
    const preview = await createPreview(db, 'https://open.spotify.com/track/novo-no-feed');
    const [post] = await db.as<{ id: string }>(friend, `insert into public.posts (author_id, body, link_preview_id) values ($1, 'novo', $2) returning id`, [friend, preview]);
    const atOpen = await db.as<{ id: string }>(me, `select id from public.feed_for_you(50, 0, $1)`, [opened]);
    expect(atOpen.map((r) => r.id)).not.toContain(post!.id);
    const now = await db.as<{ id: string }>(me, `select id from public.feed_for_you(50, 0)`);
    expect(now.map((r) => r.id)).toContain(post!.id);
  });

  it('instante no futuro não serve para nada (vale o agora)', async () => {
    const rows = await db.as<{ id: string }>(me, `select id from public.feed_for_you(50, 0, now() + interval '10 years')`);
    expect(rows.length).toBeGreaterThan(0);
  });
});

