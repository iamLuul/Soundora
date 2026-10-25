import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

// "Agora" deste arquivo: 300 dias atrás, longe dos posts e reviews dos outros testes.
const BASE = `now() - interval '300 days'`;
// O cadastro pede 3 gêneros; quem lê usa estes, sem nada a ver com os posts abaixo.
const MINE = ['gospel', 'blues', 'mpb'];
const OTHER = ['country', 'sertanejo', 'forro'];

let db: Db;
let n = 0;

async function track(artist: string, genres: string[] = [], kind: 'track' | 'album' = 'track', title?: string) {
  const [row] = await db.sql<{ id: string }>(
    `insert into public.link_previews (url, platform, kind, provider_id, title, artist, genres)
     values ($1, 'deezer', $2, $3, $4, $5, $6) returning id`,
    [`https://www.deezer.com/${kind}/rec${++n}`, kind, `rec${n}`, title ?? `${kind} ${n}`, artist, genres],
  );
  return row!.id;
}

/** Post de `author` há `hoursAgo` horas (antes de BASE). */
async function post(author: string, opts: { hoursAgo?: number; body?: string; artist?: string; genres?: string[] } = {}) {
  const preview = await track(opts.artist ?? `Banda ${n}`);
  const [row] = await db.sql<{ id: string }>(
    `insert into public.posts (author_id, link_preview_id, body, genres, created_at)
     values ($1, $2, $3, $4, ${BASE} - make_interval(hours => $5)) returning id`,
    [author, preview, opts.body ?? '', opts.genres ?? [], opts.hoursAgo ?? 2],
  );
  return row!.id;
}

const before = (hours = 1) => `${BASE} - interval '${hours} hours'`;

async function likeBefore(user: string, postId: string) {
  await db.sql(`insert into public.likes (user_id, post_id, created_at) values ($1, $2, ${before()})`, [user, postId]);
}

const forYou = async (user: string, limit = 50) =>
  (await db.as<{ id: string }>(user, `select id from public.feed_for_you($1, 0, ${BASE})`, [limit])).map((r) => r.id);

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => db.close());

describe('palavras e artistas', () => {
  it('palavras-chave: sem acento, sem link, sem palavras comuns', async () => {
    const [row] = await db.sql<{ t: string[] }>(
      `select private.terms('Que SHOW incrível do Radiohead em São Paulo, muito bom! https://x.com/abc 2024 #indie') as t`,
    );
    expect(row!.t).toEqual(expect.arrayContaining(['show', 'incrivel', 'radiohead', 'paulo', 'indie']));
    for (const no of ['que', 'muito', 'https', 'abc', '2024', 'bom']) expect(row!.t).not.toContain(no);
  });

  it('artistas: separa participações', async () => {
    const [row] = await db.sql<{ a: string[] }>(`select private.artist_names('Anitta, Pedro Sampaio & J Balvin feat. Ñengo') as a`);
    expect(row!.a.sort()).toEqual(['anitta', 'j balvin', 'nengo', 'pedro sampaio']);
  });
});

describe('Para você: sinais novos', () => {
  it('artista de música curtida no Descobrir vem antes de post mais novo sem relação', async () => {
    const me = await createUser(db, 'rec_artista', { genres: MINE });
    const a = await createUser(db, 'rec_a1', { genres: OTHER });
    const liked = await track('Marina Sena');
    await db.sql(`insert into public.discover_swipes (user_id, link_preview_id, liked, created_at) values ($1, $2, true, ${before(24)})`, [me, liked]);
    const byArtist = await post(a, { hoursAgo: 8, artist: 'Marina Sena' });
    const feat = await post(a, { hoursAgo: 8, artist: 'Outra Pessoa feat. Marina Sena' });
    const unrelated = await post(a, { hoursAgo: 1, artist: 'Ninguém' });
    const ids = await forYou(me);
    expect(ids.indexOf(byArtist)).toBeLessThan(ids.indexOf(unrelated));
    expect(ids.indexOf(feat)).toBeLessThan(ids.indexOf(unrelated));
  });

  it('palavras-chave dos posts que curti puxam posts parecidos', async () => {
    const me = await createUser(db, 'rec_palavra', { genres: MINE });
    const a = await createUser(db, 'rec_a2', { genres: OTHER });
    // As curtidas são em posts de outra pessoa (curtir alguém também puxa os posts dela).
    const c = await createUser(db, 'rec_c2', { genres: OTHER });
    await likeBefore(me, await post(c, { hoursAgo: 30, body: 'o line-up do festival Primavera Sound está absurdo' }));
    await likeBefore(me, await post(c, { hoursAgo: 40, body: 'quem vai no Primavera Sound este ano?' }));
    const match = await post(a, { hoursAgo: 8, body: 'saiu a ordem dos shows do Primavera' });
    const unrelated = await post(a, { hoursAgo: 1, body: 'bom dia, pessoal' });
    const ids = await forYou(me);
    expect(ids.indexOf(match)).toBeLessThan(ids.indexOf(unrelated));
  });

  it('pesquisas: gênero pesquisado entra no gosto; desligado, não conta', async () => {
    const me = await createUser(db, 'rec_busca', { genres: MINE });
    const a = await createUser(db, 'rec_a3', { genres: OTHER });
    await db.sql(`insert into public.search_history (user_id, term, created_at) values ($1, 'samba', ${before(5)})`, [me]);
    const samba = await post(a, { hoursAgo: 8, genres: ['samba'] });
    const unrelated = await post(a, { hoursAgo: 1, genres: ['country'] });
    expect((await forYou(me)).indexOf(samba)).toBeLessThan((await forYou(me)).indexOf(unrelated));

    await db.sql(`update public.profile_private set use_search_history = false where user_id = $1`, [me]);
    const ids = await forYou(me);
    expect(ids.indexOf(unrelated)).toBeLessThan(ids.indexOf(samba));
  });

  it('nicho de quem eu sigo e curtidas de quem eu sigo', async () => {
    const me = await createUser(db, 'rec_nicho', { genres: MINE });
    const author = await createUser(db, 'rec_a4', { genres: OTHER });
    const friends = [];
    for (const i of [1, 2, 3]) {
      // Gêneros fora dos de quem publica (senão o post sem relação também bateria pelo autor).
      const f = await createUser(db, `rec_amigo${i}`, { genres: ['reggae', 'samba', 'metal'] });
      await db.sql(`insert into public.follows (follower_id, followee_id, created_at) values ($1, $2, ${before(48)})`, [me, f]);
      friends.push(f);
    }
    const reggae = await post(author, { hoursAgo: 8, genres: ['reggae'] });
    const likedByFriend = await post(author, { hoursAgo: 8, genres: ['sertanejo'] });
    await likeBefore(friends[0]!, likedByFriend);
    const unrelated = await post(author, { hoursAgo: 1, genres: ['k_pop'] });
    const ids = await forYou(me);
    expect(ids.indexOf(reggae)).toBeLessThan(ids.indexOf(unrelated));
    expect(ids.indexOf(likedByFriend)).toBeLessThan(ids.indexOf(unrelated));
  });
});

describe('histórico de pesquisas', () => {
  it('guarda só o termo (sem acento), ignora @, links e 1 letra, e não repete no mesmo dia', async () => {
    const me = await createUser(db, 'rec_hist');
    for (const term of ['  Marina   Séna ', '@ana', 'https://open.spotify.com/x', 'a', 'marina sena', 'Jazz'])
      await db.as(me, `select public.log_search($1)`, [term]);
    const rows = await db.as<{ enabled: boolean; term: string | null }>(me, `select * from public.my_search_history()`);
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.map((r) => r.term).sort()).toEqual(['jazz', 'marina sena']);
  });

  it('ninguém lê a tabela direto; cada um só vê a própria lista', async () => {
    const me = await createUser(db, 'rec_hist2');
    const other = await createUser(db, 'rec_hist3');
    await db.as(me, `select public.log_search('segredo')`);
    await expect(db.as(other, `select * from public.search_history`)).rejects.toThrow(/permission denied/);
    await expect(db.as(other, `insert into public.search_history (user_id, term) values ($1, 'x1')`, [me])).rejects.toThrow(/permission denied/);
    const theirs = await db.as<{ term: string | null }>(other, `select * from public.my_search_history()`);
    expect(theirs).toEqual([expect.objectContaining({ term: null })]);
    await expect(db.anon(`select public.log_search('x')`)).rejects.toThrow();
  });

  it('desligar apaga e para de guardar; apagar um termo ou tudo', async () => {
    const me = await createUser(db, 'rec_hist4');
    await db.as(me, `select public.log_search('rock')`);
    await db.as(me, `select public.log_search('samba')`);
    await db.as(me, `select public.clear_search_history('rock')`);
    let rows = await db.as<{ term: string | null }>(me, `select * from public.my_search_history()`);
    expect(rows.map((r) => r.term)).toEqual(['samba']);

    await db.as(me, `select public.set_search_history_enabled(false)`);
    await db.as(me, `select public.log_search('jazz')`);
    rows = await db.as<{ enabled: boolean; term: string | null }>(me, `select * from public.my_search_history()`);
    expect(rows).toEqual([expect.objectContaining({ enabled: false, term: null })]);

    await db.as(me, `select public.set_search_history_enabled(true)`);
    await db.as(me, `select public.log_search('jazz')`);
    await db.as(me, `select public.clear_search_history()`);
    rows = await db.as<{ term: string | null }>(me, `select * from public.my_search_history()`);
    expect(rows.map((r) => r.term)).toEqual([null]);
  });

  it('no máximo as 100 últimas; mais de 90 dias some', async () => {
    const me = await createUser(db, 'rec_hist5');
    await db.sql(
      `insert into public.search_history (user_id, term, created_at) select $1, 'termo ' || i, now() - make_interval(mins => i) from generate_series(1, 105) i`,
      [me],
    );
    await db.sql(`insert into public.search_history (user_id, term, created_at) values ($1, 'velho', now() - interval '91 days')`, [me]);
    await db.as(me, `select public.log_search('novo')`);
    const [{ c }] = (await db.sql<{ c: number }>(`select count(*)::int as c from public.search_history where user_id = $1`, [me])) as [{ c: number }];
    expect(c).toBe(100);
    const old = await db.sql(`select 1 from public.search_history where term = 'velho'`);
    expect(old).toHaveLength(0);
  });
});

describe('reviews para você', () => {
  const BODY = 'Uma análise longa o bastante sobre o álbum, faixa a faixa.';

  async function review(author: string, albumId: string, likes = 0, daysAgo = 3) {
    const [row] = await db.sql<{ id: string }>(
      `insert into public.album_reviews (author_id, album_id, rating, body, created_at)
       values ($1, $2, 8.5, $3, ${BASE} - make_interval(days => $4)) returning id`,
      [author, albumId, BODY, daysAgo],
    );
    for (let i = 0; i < likes; i++) {
      const fan = await createUser(db, `rec_fan${++n}`, { genres: OTHER });
      await db.sql(`insert into public.review_likes (user_id, review_id, created_at) values ($1, $2, ${before(2)})`, [fan, row!.id]);
    }
    return row!.id;
  }

  const reviewsFor = async (user: string) =>
    (await db.as<{ id: string; liked_by_me: boolean }>(user, `select * from public.feed_reviews_for_you(30, ${BASE})`)).map((r) => r.id);

  it('primeiro as do meu gosto; populares fora do gosto depois; sem as fracas fora do gosto', async () => {
    const me = await createUser(db, 'rec_rev', { genres: MINE });
    const a = await createUser(db, 'rec_rev_a', { genres: OTHER });
    await db.sql(`insert into public.discover_swipes (user_id, link_preview_id, liked, created_at) values ($1, $2, true, ${before(24)})`, [
      me,
      await track('Tim Maia'),
    ]);
    const mine = await review(a, await track('Tim Maia', [], 'album', 'Racional'), 1);
    const popular = await review(a, await track('Alguém', ['country'], 'album'), 5);
    const weak = await review(a, await track('Fulano', ['country'], 'album'), 1);
    const ids = await reviewsFor(me);
    expect(ids[0]).toBe(mine);
    expect(ids).toContain(popular);
    expect(ids).not.toContain(weak);
  });

  it('fora: as minhas, as que curti, bloqueados, privadas que não sigo, gênero silenciado; uma por álbum', async () => {
    const me = await createUser(db, 'rec_rev2', { genres: MINE });
    const a = await createUser(db, 'rec_rev_b', { genres: OTHER });
    const blocked = await createUser(db, 'rec_rev_c', { genres: OTHER });
    const priv = await createUser(db, 'rec_rev_d', { genres: OTHER });
    await db.sql(`update public.profiles set is_private = true where id = $1`, [priv]);
    await db.sql(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [me, blocked]);
    await db.sql(`insert into public.muted_genres (user_id, genre) values ($1, 'trap')`, [me]);

    const ok = await review(a, await track('X', ['gospel'], 'album'), 3);
    const own = await review(me, await track('Y', ['gospel'], 'album'), 3);
    const liked = await review(a, await track('Z', ['gospel'], 'album'), 3);
    await db.sql(`insert into public.review_likes (user_id, review_id, created_at) values ($1, $2, ${before(1)})`, [me, liked]);
    const fromBlocked = await review(blocked, await track('W', ['gospel'], 'album'), 3);
    const fromPrivate = await review(priv, await track('V', ['gospel'], 'album'), 3);
    const muted = await review(a, await track('U', ['trap', 'gospel'], 'album'), 3);
    const shared = await track('T', ['gospel'], 'album');
    const best = await review(a, shared, 4);
    const second = await review(await createUser(db, 'rec_rev_e', { genres: OTHER }), shared, 1);

    const ids = await reviewsFor(me);
    expect(ids).toContain(ok);
    expect(ids).toContain(best);
    for (const no of [own, liked, fromBlocked, fromPrivate, muted, second]) expect(ids).not.toContain(no);

    // Seguindo a conta privada, a review dela aparece.
    await db.sql(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, priv]);
    expect(await reviewsFor(me)).toContain(fromPrivate);
  });

  it('só com login', async () => {
    await expect(db.anon(`select * from public.feed_reviews_for_you()`)).rejects.toThrow();
  });
});
