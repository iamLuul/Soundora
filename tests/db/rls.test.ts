import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let caio: string;
let previewId: string;
let postAna: string;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'ana');
  bia = await createUser(db, 'bia');
  caio = await createUser(db, 'caio');
  previewId = await createPreview(db, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  const [p] = await db.as<{ id: string }>(ana, `insert into public.posts (author_id, body, link_preview_id, genre) values ($1, 'ouçam', $2, 'indie') returning id`, [
    ana,
    previewId,
  ]);
  postAna = p!.id;
});
afterAll(async () => db.close());

describe('perfis', () => {
  it('aparecem para quem está logado; sem login, nada', async () => {
    expect(await db.as(bia, `select username from public.profiles where username = 'ana'`)).toEqual([{ username: 'ana' }]);
    await expect(db.anon(`select username from public.profiles`)).rejects.toThrow(/permission denied/);
  });

  it('a pessoa edita o próprio nome e bio', async () => {
    await db.as(ana, `update public.profiles set display_name = 'Ana B', bio = 'indie' where id = $1`, [ana]);
    const [row] = await db.sql(`select display_name, bio from public.profiles where id = $1`, [ana]);
    expect(row).toEqual({ display_name: 'Ana B', bio: 'indie' });
  });

  it('não muda o perfil de outra pessoa', async () => {
    await db.as(bia, `update public.profiles set display_name = 'hackeado' where id = $1`, [ana]);
    const [row] = await db.sql(`select display_name from public.profiles where id = $1`, [ana]);
    expect(row!.display_name).toBe('Ana B');
  });

  it('não troca o próprio username direto (só por função própria no futuro)', async () => {
    await expect(db.as(ana, `update public.profiles set username = 'outra' where id = $1`, [ana])).rejects.toThrow(/permission denied/);
  });

  it('não cria perfil pulando o onboarding', async () => {
    const [u] = await db.sql<{ id: string }>(`insert into auth.users (email) values ('x@x.dev') returning id`);
    await expect(
      db.as(u!.id, `insert into public.profiles (id, username, display_name) values ($1, 'pulei', 'x')`, [u!.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it('data de nascimento só aparece para a própria pessoa', async () => {
    expect(await db.as(bia, `select * from public.profile_private where user_id = $1`, [ana])).toEqual([]);
    expect(await db.as(ana, `select user_id from public.profile_private`)).toEqual([{ user_id: ana }]);
    await expect(db.anon(`select * from public.profile_private`)).rejects.toThrow(/permission denied/);
  });
});

describe('posts', () => {
  it('só publica em nome próprio', async () => {
    await expect(
      db.as(bia, `insert into public.posts (author_id, link_preview_id) values ($1, $2)`, [ana, previewId]),
    ).rejects.toThrow(/row-level security/);
  });

  it('não cria cartão de prévia pelo app (só a Edge Function)', async () => {
    await expect(
      db.as(bia, `insert into public.link_previews (url, platform, kind, title) values ('https://x.dev', 'spotify', 'track', 't')`),
    ).rejects.toThrow(/permission denied/);
  });

  it('não altera contadores na mão', async () => {
    await expect(db.as(ana, `update public.posts set like_count = 999 where id = $1`, [postAna])).rejects.toThrow(/permission denied/);
  });

  it('outra pessoa não edita nem apaga meu post', async () => {
    await db.as(bia, `update public.posts set body = 'x' where id = $1`, [postAna]);
    await db.as(bia, `delete from public.posts where id = $1`, [postAna]);
    const [row] = await db.sql(`select body from public.posts where id = $1`, [postAna]);
    expect(row!.body).toBe('ouçam');
  });

  it('admin pode apagar post (moderação)', async () => {
    const [p] = await db.as<{ id: string }>(bia, `insert into public.posts (author_id, link_preview_id) values ($1, $2) returning id`, [bia, previewId]);
    await db.sql(`insert into public.admins values ($1)`, [caio]);
    await db.as(caio, `delete from public.posts where id = $1`, [p!.id]);
    expect(await db.sql(`select 1 from public.posts where id = $1`, [p!.id])).toEqual([]);
    await db.sql(`delete from public.admins where user_id = $1`, [caio]);
  });
});

describe('curtidas e comentários', () => {
  it('curtir atualiza o contador e descurtir desfaz', async () => {
    await db.as(bia, `insert into public.likes (user_id, post_id) values ($1, $2)`, [bia, postAna]);
    await db.as(caio, `insert into public.likes (user_id, post_id) values ($1, $2)`, [caio, postAna]);
    expect((await db.sql(`select like_count from public.posts where id = $1`, [postAna]))[0]).toEqual({ like_count: 2 });
    await db.as(caio, `delete from public.likes where user_id = $1 and post_id = $2`, [caio, postAna]);
    expect((await db.sql(`select like_count from public.posts where id = $1`, [postAna]))[0]).toEqual({ like_count: 1 });
  });

  it('não curte em nome de outra pessoa', async () => {
    await expect(db.as(bia, `insert into public.likes (user_id, post_id) values ($1, $2)`, [caio, postAna])).rejects.toThrow(/row-level security/);
  });

  it('dono do post apaga comentário de outra pessoa no próprio post', async () => {
    const [c] = await db.as<{ id: string }>(caio, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'massa') returning id`, [postAna, caio]);
    expect((await db.sql(`select comment_count from public.posts where id = $1`, [postAna]))[0]).toEqual({ comment_count: 1 });
    await db.as(ana, `delete from public.comments where id = $1`, [c!.id]);
    expect((await db.sql(`select comment_count from public.posts where id = $1`, [postAna]))[0]).toEqual({ comment_count: 0 });
  });
});

describe('bloqueios', () => {
  it('bloquear esconde posts, perfil e desfaz o seguir nos dois sentidos', async () => {
    await db.as(caio, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [caio, ana]);
    await db.as(ana, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [ana, caio]);
    await db.as(ana, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [ana, caio]);

    expect(await db.as(caio, `select id from public.posts where author_id = $1`, [ana])).toEqual([]);
    expect(await db.as(caio, `select id from public.profiles where id = $1`, [ana])).toEqual([]);
    expect(await db.sql(`select * from public.follows where $1 in (follower_id, followee_id) and $2 in (follower_id, followee_id)`, [ana, caio])).toEqual([]);
  });

  it('quem foi bloqueado não consegue seguir, curtir nem comentar', async () => {
    await expect(db.as(caio, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [caio, ana])).rejects.toThrow(/row-level security/);
    await expect(db.as(caio, `insert into public.likes (user_id, post_id) values ($1, $2)`, [caio, postAna])).rejects.toThrow(/row-level security/);
    await expect(
      db.as(caio, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'oi')`, [postAna, caio]),
    ).rejects.toThrow(/row-level security/);
  });

  it('a lista de bloqueios só é visível para quem bloqueou', async () => {
    expect(await db.as(caio, `select * from public.blocks`)).toEqual([]);
    expect(await db.as(ana, `select blocked_id from public.blocks`)).toEqual([{ blocked_id: caio }]);
  });
});

describe('denúncias', () => {
  it('denuncia e vê só as próprias denúncias', async () => {
    await db.as(bia, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [bia, postAna]);
    expect(await db.as(ana, `select * from public.reports`)).toEqual([]);
    expect(await db.as(bia, `select reason from public.reports`)).toEqual([{ reason: 'spam' }]);
  });

  it('não marca a própria denúncia como resolvida', async () => {
    await db.as(bia, `update public.reports set status = 'resolved' where reporter_id = $1`, [bia]);
    expect((await db.sql(`select status from public.reports where reporter_id = $1`, [bia]))[0]).toEqual({ status: 'open' });
  });
});

describe('conta: username e foto', () => {
  it('username_available: livre, ocupado (sem diferenciar maiúsculas) e inválido', async () => {
    expect((await db.as(bia, `select public.username_available('novo_nome') as ok`))[0]).toEqual({ ok: true });
    expect((await db.as(bia, `select public.username_available('ANA') as ok`))[0]).toEqual({ ok: false });
    expect((await db.as(bia, `select public.username_available('a b') as ok`))[0]).toEqual({ ok: false });
    expect((await db.as(bia, `select public.username_available('.ana') as ok`))[0]).toEqual({ ok: false });
  });

  it('username_available só para quem está logado', async () => {
    await expect(db.anon(`select public.username_available('x')`)).rejects.toThrow(/permission denied/);
  });

  it('a foto do perfil só muda pelo servidor, e só com um arquivo da própria pasta', async () => {
    const mine = `avatars/${ana}/avatar-1760000000000.jpg`;
    // O app não grava a foto direto (só a Edge Function upload-avatar, com a chave secreta).
    await expect(db.as(ana, `update public.profiles set avatar_url = $1 where id = $2`, [mine, ana])).rejects.toThrow(/permission denied/);

    await db.sql(`update public.profiles set avatar_url = $1 where id = $2`, [mine, ana]);
    expect((await db.sql(`select avatar_url from public.profiles where id = $1`, [ana]))[0]).toEqual({ avatar_url: mine });

    for (const bad of [
      `avatars/${bia}/avatar-1760000000000.jpg`,
      'https://evil.example/x.jpg',
      `avatars/${ana}/../${bia}/avatar-1760000000000.jpg`,
      `avatars/${ana}/avatar-1760000000000.svg`,
    ]) {
      await expect(db.sql(`update public.profiles set avatar_url = $1 where id = $2`, [bad, ana])).rejects.toThrow(/profiles_avatar_path/);
    }
  });
});

