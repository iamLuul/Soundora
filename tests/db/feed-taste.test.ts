import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

// "Agora" deste arquivo: 120 dias atrás, longe dos posts dos outros testes (janela de 14 dias).
// Instante fixo (como o app manda): a variação do Para você depende do instante de abertura.
const BASE = `'${new Date(Date.now() - 120 * 86_400_000).toISOString()}'::timestamptz`;
// O cadastro pede 3 gêneros; os autores usam estes, fora do gosto de quem lê.
const OTHER = ['country', 'sertanejo', 'forro'];

let db: Db;
let n = 0;

/** Post de `author` há `hoursAgo` horas (antes de BASE), com gêneros no post e/ou na música. */
async function post(author: string, opts: { hoursAgo?: number; genres?: string[]; musicGenres?: string[]; title?: string } = {}) {
  const preview = await createPreview(db, `https://open.spotify.com/track/taste${String(++n).padStart(17, '0')}`, opts.title ?? `faixa ${n}`);
  if (opts.musicGenres) await db.sql(`update public.link_previews set genres = $2 where id = $1`, [preview, opts.musicGenres]);
  // Cada música de um artista diferente (o mesmo artista em tudo faria todo post "bater" com o gosto).
  await db.sql(`update public.link_previews set artist = $2 where id = $1`, [preview, `Artista ${n}`]);
  const [row] = await db.sql<{ id: string }>(
    `insert into public.posts (author_id, link_preview_id, genres, created_at)
     values ($1, $2, $3, ${BASE} - make_interval(hours => $4)) returning id`,
    [author, preview, opts.genres ?? [], opts.hoursAgo ?? 2],
  );
  return row!.id;
}

/** Ação feita antes de abrir o feed (as que vêm depois não contam). */
async function likeBefore(user: string, postId: string) {
  await db.sql(`insert into public.likes (user_id, post_id, created_at) values ($1, $2, ${BASE} - interval '1 hour')`, [user, postId]);
}

const forYou = async (user: string, limit = 50) =>
  (await db.as<{ id: string }>(user, `select id from public.feed_for_you($1, 0, ${BASE})`, [limit])).map((r) => r.id);

beforeAll(async () => {
  db = await connect();
});
afterAll(async () => db.close());

describe('Para você pelo gosto', () => {
  it('conta nova: primeiro os posts dos gêneros que escolhi (no post, na música ou no perfil do autor)', async () => {
    const me = await createUser(db, 'gosto_novo', { genres: ['shoegaze', 'jazz', 'mpb'] });
    const a = await createUser(db, 'gosto_a', { genres: OTHER });
    const b = await createUser(db, 'gosto_b', { genres: ['shoegaze', 'country', 'sertanejo'] });

    const unrelated = await post(a, { hoursAgo: 1, genres: ['country'] }); // mais novo, mas fora do gosto
    const byGenre = await post(a, { hoursAgo: 5, genres: ['shoegaze'] });
    const byMusic = await post(a, { hoursAgo: 5, musicGenres: ['jazz'] });
    const byAuthor = await post(b, { hoursAgo: 5 }); // post sem gênero, de quem escolheu shoegaze
    const similar = await post(a, { hoursAgo: 5, genres: ['dream_pop'] }); // não é nenhum dos meus

    const ids = await forYou(me);
    for (const relevant of [byGenre, byMusic, byAuthor]) expect(ids.indexOf(relevant)).toBeLessThan(ids.indexOf(unrelated));
    // Fora do gosto só aparece depois, mas aparece (o feed não fica vazio).
    expect(ids).toContain(unrelated);
    expect(ids).toContain(similar);
  });

  it('gêneros parecidos contam: quem gosta de rock vê indie_rock antes do resto', async () => {
    const me = await createUser(db, 'gosto_rock', { genres: ['hard_rock', 'gospel', 'blues'] });
    const a = await createUser(db, 'gosto_c', { genres: OTHER });
    const near = await post(a, { hoursAgo: 6, genres: ['indie_rock'] });
    const far = await post(a, { hoursAgo: 1, genres: ['country'] });
    const ids = await forYou(me);
    expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(far));
  });

  it('curtir, comentar e curtir no Descobrir ensinam gêneros novos', async () => {
    const me = await createUser(db, 'gosto_aprende', { genres: ['mpb', 'gospel', 'blues'] });
    const a = await createUser(db, 'gosto_d', { genres: OTHER });
    const target = await post(a, { hoursAgo: 3, genres: ['trap'] });
    const kpop = await post(a, { hoursAgo: 3, genres: ['k_pop'] });
    const reggae = await post(a, { hoursAgo: 3, genres: ['reggae'] });
    const other = await post(a, { hoursAgo: 1, genres: ['country'] });

    // Antes: trap e k-pop não têm nada a ver comigo.
    let ids = await forYou(me);
    expect(ids.indexOf(other)).toBeLessThan(ids.indexOf(target));

    // Curti dois posts de trap (de outra pessoa, antes de abrir o feed)…
    const c = await createUser(db, 'gosto_e', { genres: OTHER });
    await likeBefore(me, await post(c, { hoursAgo: 48, genres: ['trap'] }));
    await likeBefore(me, await post(c, { hoursAgo: 50, genres: ['trap'] }));
    // …comentei num post de reggae…
    const commented = await post(c, { hoursAgo: 48, genres: ['reggae'] });
    await db.sql(`insert into public.comments (post_id, author_id, body, created_at) values ($1, $2, 'boa', ${BASE} - interval '1 hour')`, [commented, me]);
    // …e curti uma música de k-pop no Descobrir.
    const song = await createPreview(db, 'https://open.spotify.com/track/kpopdescobrir00000000');
    await db.sql(`update public.link_previews set genres = '{k_pop}', artist = 'Grupo de K-pop' where id = $1`, [song]);
    await db.sql(`insert into public.discover_swipes (user_id, link_preview_id, liked, created_at) values ($1, $2, true, ${BASE} - interval '1 hour')`, [me, song]);

    ids = await forYou(me);
    expect(ids.indexOf(target)).toBeLessThan(ids.indexOf(other));
    expect(ids.indexOf(kpop)).toBeLessThan(ids.indexOf(other));
    expect(ids.indexOf(reggae)).toBeLessThan(ids.indexOf(other));
  });

  it('o que faço depois de abrir o feed não muda as páginas que já estou vendo', async () => {
    const me = await createUser(db, 'gosto_fixo', { genres: ['mpb', 'gospel', 'blues'] });
    const a = await createUser(db, 'gosto_f', { genres: OTHER });
    const liked = await post(a, { hoursAgo: 30, genres: ['metal'] });
    const before = await forYou(me);
    // Curtida "agora" (depois do instante do feed): não conta para o feed aberto em BASE.
    await db.as(me, `insert into public.likes (user_id, post_id) values ($1, $2)`, [me, liked]);
    expect(await forYou(me)).toEqual(before);
  });

  it('quem sigo vem antes de quem só tem o gênero', async () => {
    const me = await createUser(db, 'gosto_segue', { genres: ['samba', 'gospel', 'blues'] });
    const friend = await createUser(db, 'gosto_amigo', { genres: OTHER });
    const stranger = await createUser(db, 'gosto_g', { genres: OTHER });
    await db.as(me, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, friend]);
    const fromFriend = await post(friend, { hoursAgo: 3 });
    const fromGenre = await post(stranger, { hoursAgo: 3, genres: ['samba'] });
    const ids = await forYou(me);
    expect(ids.indexOf(fromFriend)).toBeLessThan(ids.indexOf(fromGenre));
  });
});

describe('Seguindo', () => {
  it('só quem eu sigo e eu, do mais novo ao mais velho, paginando sem repetir', async () => {
    const me = await createUser(db, 'seg_eu');
    const friend = await createUser(db, 'seg_amigo');
    const stranger = await createUser(db, 'seg_estranho');
    await db.as(me, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, friend]);
    const mine = await post(me, { hoursAgo: 1 });
    const f1 = await post(friend, { hoursAgo: 2 });
    const f2 = await post(friend, { hoursAgo: 3 });
    const strangerPost = await post(stranger, { hoursAgo: 1, genres: ['indie'] });

    type Row = { id: string; created_at: Date };
    const page1 = await db.as<Row>(me, `select id, created_at from public.feed_following(null, null, 2)`);
    const last = page1[page1.length - 1]!;
    const page2 = await db.as<Row>(me, `select id, created_at from public.feed_following($1, $2, 2)`, [last.created_at, last.id]);
    const ids = [...page1, ...page2].map((r) => r.id);
    expect(ids).toEqual([mine, f1, f2]);
    expect(ids).not.toContain(strangerPost);
  });

  it('é só para quem está logado', async () => {
    await expect(db.anon(`select * from public.feed_following()`)).rejects.toThrow(/permission denied/);
  });
});

describe('contas sugeridas', () => {
  it('sugere quem tem o meu gosto ou é seguido por quem sigo; nunca eu, quem já sigo ou bloqueados', async () => {
    const me = await createUser(db, 'sug_eu', { genres: ['bossa_nova', 'gospel', 'blues'] });
    const sameTaste = await createUser(db, 'sug_bossa', { genres: ['bossa_nova', 'country', 'forro'] });
    const followed = await createUser(db, 'sug_seguido', { genres: ['bossa_nova', 'country', 'forro'] });
    const blocked = await createUser(db, 'sug_bloqueado', { genres: ['bossa_nova', 'country', 'forro'] });
    const friendOfFriend = await createUser(db, 'sug_amigo2', { genres: OTHER });
    await db.as(me, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, followed]);
    await db.as(followed, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [followed, friendOfFriend]);
    await db.as(me, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [me, blocked]);

    const rows = await db.as<{ id: string; username: string; genres: string[]; reason: string }>(me, `select * from public.suggested_accounts(30)`);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(sameTaste);
    expect(ids).toContain(friendOfFriend);
    expect(ids).not.toContain(me);
    expect(ids).not.toContain(followed);
    expect(ids).not.toContain(blocked);
    expect(rows.find((r) => r.id === sameTaste)).toMatchObject({ genres: ['bossa_nova'], reason: 'genres' });
    expect(rows.find((r) => r.id === friendOfFriend)?.reason).toBe('friends');
    // Nada de e-mail ou dado privado na resposta.
    expect(Object.keys(rows[0]!).sort()).toEqual(['avatar_url', 'display_name', 'genres', 'id', 'reason', 'username']);
  });

  it('é só para quem está logado', async () => {
    await expect(db.anon(`select * from public.suggested_accounts()`)).rejects.toThrow(/permission denied/);
  });
});
