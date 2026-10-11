import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let lia: string;
let max: string;
let nina: string;
let blocked: string;

interface Item {
  id: string;
  body: string;
  genre: string | null;
  genres: string[];
  media: { path: string; kind: string; width: number; height: number; duration_ms: number | null }[];
  post_type: string;
  preview_title: string | null;
}

/** Simula o arquivo que a Edge Function media-upload gravou no bucket. */
async function stored(owner: string, ext: 'jpg' | 'mp4') {
  const name = `${owner}/${crypto.randomUUID()}.${ext}`;
  await db.sql(`insert into storage.objects (bucket_id, name) values ('post-media', $1)`, [name]);
  return name;
}

const create = (user: string, body: string, preview: string | null, genres: string[] = [], media: unknown[] = []) =>
  db.as<{ id: string }>(user, `select public.post_create($1, $2, $3::text[], $4::jsonb) as id`, [body, preview, genres, JSON.stringify(media)]).then((r) => r[0]!.id);

const detail = (user: string, id: string) => db.as<Item>(user, `select * from public.post_detail($1)`, [id]).then((r) => r[0]);

beforeAll(async () => {
  db = await connect();
  lia = await createUser(db, 'post_lia');
  max = await createUser(db, 'post_max');
  nina = await createUser(db, 'post_nina');
  blocked = await createUser(db, 'post_blocked');
  await db.as(blocked, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [blocked, lia]);
});
afterAll(async () => db.close());

describe('publicar', () => {
  it('só texto', async () => {
    const id = await create(lia, '  bom dia, quem tá ouvindo o quê?  ', null);
    expect(await detail(max, id)).toMatchObject({ body: 'bom dia, quem tá ouvindo o quê?', post_type: 'text', media: [], preview_title: null });
  });

  it('música com até 3 gêneros de toda a lista (sem repetir); o primeiro vira o gênero principal', async () => {
    const preview = await createPreview(db, 'https://open.spotify.com/track/posts000000000000000001', 'Envolver');
    const id = await create(lia, '', preview, ['latin', 'pop', 'latin']);
    expect(await detail(max, id)).toMatchObject({ post_type: 'music', genres: ['latin', 'pop'], genre: 'latin', preview_title: 'Envolver' });
    await expect(create(lia, '', preview, ['latin', 'pop', 'rock', 'jazz'])).rejects.toThrow(/posts_genres_max/);
    await expect(create(lia, '', preview, ['nao_existe'])).rejects.toThrow(/invalid_genre/);
  });

  it('até 4 fotos, ou 1 vídeo', async () => {
    const photos = await Promise.all([1, 2, 3].map(() => stored(lia, 'jpg')));
    const id = await create(lia, 'fotos do show', null, [], photos.map((path) => ({ path, kind: 'photo', width: 1080, height: 1350 })));
    const item = await detail(max, id);
    expect(item!.post_type).toBe('media');
    expect(item!.media.map((m) => m.path)).toEqual(photos);

    const video = await stored(lia, 'mp4');
    const vid = await create(lia, '', null, [], [{ path: video, kind: 'video', width: 720, height: 1280, duration_ms: 12000 }]);
    expect((await detail(max, vid))!.media).toEqual([{ path: video, kind: 'video', width: 720, height: 1280, duration_ms: 12000 }]);

    const five = await Promise.all([1, 2, 3, 4, 5].map(() => stored(lia, 'jpg')));
    await expect(create(lia, '', null, [], five.map((path) => ({ path, kind: 'photo', width: 10, height: 10 })))).rejects.toThrow(/invalid_media/);
    const mix = [await stored(lia, 'jpg'), await stored(lia, 'mp4')];
    await expect(
      create(lia, '', null, [], [
        { path: mix[0], kind: 'photo', width: 10, height: 10 },
        { path: mix[1], kind: 'video', width: 10, height: 10, duration_ms: 1000 },
      ]),
    ).rejects.toThrow(/invalid_media/);
  });

  it('mídia: só arquivo meu, gravado pela Edge Function e não usado', async () => {
    const other = await stored(max, 'jpg');
    await expect(create(lia, '', null, [], [{ path: other, kind: 'photo', width: 10, height: 10 }])).rejects.toThrow(/invalid_media/);
    await expect(create(lia, '', null, [], [{ path: `${lia}/${crypto.randomUUID()}.jpg`, kind: 'photo', width: 10, height: 10 }])).rejects.toThrow(/invalid_media/);
  });

  it('post vazio ou texto longo demais: recusado', async () => {
    await expect(create(lia, '   ', null)).rejects.toThrow(/post_empty/);
    await expect(create(lia, 'x'.repeat(501), null)).rejects.toThrow(/post_text_too_long/);
  });

  it('direto na tabela: não dá para escolher o tipo nem criar post vazio', async () => {
    await expect(db.as(lia, `insert into public.posts (author_id, body, type) values ($1, 'x', 'media')`, [lia])).rejects.toThrow(/permission denied/);
    await expect(db.as(lia, `insert into public.posts (author_id, body) values ($1, '')`, [lia])).rejects.toThrow(/posts_has_content/);
    await expect(db.as(lia, `insert into public.post_media (post_id, position, kind, path, width, height) values (gen_random_uuid(), 0, 'photo', 'x.jpg', 1, 1)`)).rejects.toThrow(/permission denied/);
  });

  it('mídia no Storage: abre para quem vê o post, não para quem tem bloqueio', async () => {
    const photo = await stored(lia, 'jpg');
    await create(lia, '', null, [], [{ path: photo, kind: 'photo', width: 10, height: 10 }]);
    const canSee = async (user: string) => (await db.as(user, `select 1 from storage.objects where bucket_id = 'post-media' and name = $1`, [photo])).length === 1;
    expect(await canSee(max)).toBe(true);
    expect(await canSee(blocked)).toBe(false);
  });

  it('no feed e no perfil, com mídia e gêneros', async () => {
    const rows = await db.as<Item>(max, `select * from public.profile_posts($1)`, [lia]);
    expect(rows.some((r) => r.post_type === 'text')).toBe(true);
    expect(rows.some((r) => r.media.length === 3)).toBe(true);
    const feed = await db.as<Item>(max, `select * from public.feed_for_you(50, 0)`);
    expect(feed.some((r) => r.post_type === 'media')).toBe(true);
  });
});

describe('post aberto, curtidos e listas do perfil', () => {
  it('post de quem tem bloqueio comigo não abre', async () => {
    const id = await create(lia, 'oi', null);
    expect(await detail(blocked, id)).toBeUndefined();
  });

  it('curtidos: do mais recente para o mais antigo, paginando', async () => {
    const a = await create(max, 'a', null);
    const b = await create(max, 'b', null);
    await db.as(nina, `insert into public.likes (user_id, post_id) values ($1, $2)`, [nina, a]);
    await db.sql(`update public.likes set created_at = now() - interval '1 hour' where user_id = $1 and post_id = $2`, [nina, a]);
    await db.as(nina, `insert into public.likes (user_id, post_id) values ($1, $2)`, [nina, b]);
    const page1 = await db.as<Item>(lia, `select * from public.liked_posts($1, null, 1)`, [nina]);
    expect(page1.map((r) => r.body)).toEqual(['b']);
    const page2 = await db.as<Item>(lia, `select * from public.liked_posts($1, $2, 5)`, [nina, page1[0]!.id]);
    expect(page2.map((r) => r.body)).toEqual(['a']);
  });

  it('seguidores e seguindo, com "eu sigo"', async () => {
    await db.as(lia, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [lia, nina]);
    await db.as(max, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [max, nina]);
    await db.as(lia, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [lia, max]);
    const followers = await db.as<{ username: string; i_follow: boolean }>(lia, `select username, i_follow from public.profile_people('post_nina', 'followers')`);
    expect(followers).toEqual([
      { username: 'post_max', i_follow: true },
      { username: 'post_lia', i_follow: false },
    ]);
    const following = await db.as<{ username: string }>(nina, `select username from public.profile_people('post_lia', 'following')`);
    expect(following.map((r) => r.username).sort()).toEqual(['post_max', 'post_nina']);
    // Quem tem bloqueio comigo some da lista.
    await db.as(blocked, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [blocked, nina]);
    expect((await db.as<{ username: string }>(lia, `select username from public.profile_people('post_nina', 'followers')`)).map((r) => r.username)).not.toContain('post_blocked');
  });
});
