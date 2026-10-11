import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let gabi: string;
let hugo: string;

beforeAll(async () => {
  db = await connect();
  gabi = await createUser(db, 'gabi');
  hugo = await createUser(db, 'hugo');
});
afterAll(async () => db.close());

describe('troca de @', () => {
  it('valida o formato e recusa @ de outra pessoa', async () => {
    await expect(db.as(gabi, `select public.change_username('ab')`)).rejects.toThrow(/username_too_short/);
    await expect(db.as(gabi, `select public.change_username('com espaço')`)).rejects.toThrow(/username_invalid_chars/);
    await expect(db.as(gabi, `select public.change_username('.gabi')`)).rejects.toThrow(/username_invalid_dots/);
    await expect(db.as(gabi, `select public.change_username('HUGO')`)).rejects.toThrow(/username_taken/);
  });

  it('troca uma vez e depois só daqui a 30 dias', async () => {
    const [row] = await db.as<{ name: string }>(gabi, `select public.change_username('  Gabi.Nova ') as name`);
    expect(row).toEqual({ name: 'gabi.nova' });
    const [p] = await db.sql<{ username: string; changed: boolean }>(
      `select username, username_changed_at is not null as changed from public.profiles where id = $1`,
      [gabi],
    );
    expect(p).toEqual({ username: 'gabi.nova', changed: true });
    // O @ antigo fica livre para outra pessoa.
    expect((await db.as(hugo, `select public.username_available('gabi') as ok`))[0]).toEqual({ ok: true });

    await expect(db.as(gabi, `select public.change_username('gabi.outra')`)).rejects.toThrow(/username_change_too_soon/);
    // Repetir o @ atual não conta como troca.
    expect((await db.as(gabi, `select public.change_username('gabi.nova') as name`))[0]).toEqual({ name: 'gabi.nova' });

    await db.sql(`update public.profiles set username_changed_at = now() - interval '31 days' where id = $1`, [gabi]);
    expect((await db.as(gabi, `select public.change_username('gabi') as name`))[0]).toEqual({ name: 'gabi' });
  });

  it('o app não troca o @ nem a data de troca direto na tabela', async () => {
    await expect(db.as(hugo, `update public.profiles set username = 'hugo2' where id = $1`, [hugo])).rejects.toThrow(/permission denied/);
    await expect(db.as(hugo, `update public.profiles set username_changed_at = null where id = $1`, [hugo])).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select public.change_username('x_y_z')`)).rejects.toThrow(/permission denied/);
  });
});

describe('banner', () => {
  it('só o servidor grava, e só um arquivo da própria pasta do bucket banners', async () => {
    const mine = `banners/${hugo}/banner-1760000000000.jpg`;
    await expect(db.as(hugo, `update public.profiles set banner_url = $1 where id = $2`, [mine, hugo])).rejects.toThrow(/permission denied/);
    await db.sql(`update public.profiles set banner_url = $1 where id = $2`, [mine, hugo]);
    for (const bad of [`banners/${gabi}/banner-1760000000000.jpg`, `avatars/${hugo}/avatar-1760000000000.jpg`, 'https://evil.example/b.jpg']) {
      await expect(db.sql(`update public.profiles set banner_url = $1 where id = $2`, [bad, hugo])).rejects.toThrow(/profiles_banner_path/);
    }
  });

  it('bucket banners: 2 MB, só imagens, sem escrita pelo app', async () => {
    const [b] = await db.sql(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'banners'`);
    expect(b).toEqual({ public: true, file_size_limit: '2097152', allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] });
    await expect(
      db.as(hugo, `insert into storage.objects (bucket_id, name) values ('banners', $1)`, [`${hugo}/banner-1.jpg`]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('profile_summary', () => {
  it('traz banner e quantos posts a pessoa curtiu', async () => {
    const p = await createPreview(db, 'https://open.spotify.com/track/perfil');
    const [post] = await db.as<{ id: string }>(hugo, `insert into public.posts (author_id, body, link_preview_id) values ($1, 'oi', $2) returning id`, [hugo, p]);
    await db.as(gabi, `insert into public.likes (user_id, post_id) values ($1, $2)`, [gabi, post!.id]);
    const [s] = await db.as(gabi, `select banner_url, likes, posts, is_me from public.profile_summary('hugo')`);
    expect(s).toEqual({ banner_url: `banners/${hugo}/banner-1760000000000.jpg`, likes: 0, posts: 1, is_me: false });
    const [g] = await db.as(hugo, `select likes from public.profile_summary('gabi')`);
    expect(g).toEqual({ likes: 1 });
  });
});
