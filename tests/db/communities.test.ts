import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let dona: string;
let mod: string;
let membro: string;
let fora: string;
let bloqueado: string;
let aberta: string;
let fechada: string;

interface Item {
  id: string;
  body: string;
  community: { id: string; slug: string; name: string; closed: boolean } | null;
}

const create = (user: string, slug: string, visibility: 'open' | 'closed', extra: { genres?: string[]; artists?: string[]; description?: string } = {}) =>
  db
    .as<{ id: string }>(user, `select public.community_create($1, $2, $3, $4, $5, $6, 1) as id`, [
      slug,
      `Comunidade ${slug}`,
      extra.description ?? 'fãs reunidos',
      visibility,
      extra.genres ?? ['indie'],
      extra.artists ?? [],
    ])
    .then((r) => r[0]!.id);
const post = (user: string, body: string, community: string | null = null) =>
  db.as<{ id: string }>(user, `select public.post_create(p_body => $1, p_community => $2) as id`, [body, community]).then((r) => r[0]!.id);
const join = (user: string, c: string) => db.as<{ s: string }>(user, `select public.community_join($1) as s`, [c]).then((r) => r[0]!.s);
const communityPosts = (user: string, c: string | null) => db.as<Item>(user, `select * from public.community_posts($1)`, [c]);

beforeAll(async () => {
  db = await connect();
  dona = await createUser(db, 'cm_dona');
  mod = await createUser(db, 'cm_mod');
  membro = await createUser(db, 'cm_membro');
  fora = await createUser(db, 'cm_fora');
  bloqueado = await createUser(db, 'cm_bloq');
  aberta = await create(dona, 'fas_da_banda', 'open', { genres: ['indie', 'rock'], artists: ['Arctic Monkeys', ' arctic monkeys ', 'The Strokes'] });
  fechada = await create(dona, 'clube_secreto', 'closed');
});
afterAll(async () => db.close());

describe('criar comunidade', () => {
  it('a criadora vira dona; @ único; artistas sem repetir; gêneros válidos', async () => {
    const [c] = await db.as<{ my_role: string; member_count: number; artists: string[]; genres: string[] }>(dona, `select * from public.community_get('fas_da_banda')`);
    expect(c).toMatchObject({ my_role: 'owner', member_count: 1, artists: ['Arctic Monkeys', 'The Strokes'], genres: ['indie', 'rock'] });
    await expect(create(fora, 'fas_da_banda', 'open')).rejects.toThrow(/community_slug_taken/);
    await expect(create(fora, 'Com Espaço', 'open')).rejects.toThrow(/community_slug_invalid/);
    await expect(create(fora, 'gen_ruim', 'open', { genres: ['nao_existe'] })).rejects.toThrow(/invalid_genre/);
    await expect(db.as(fora, `insert into public.communities (slug, name) values ('x_x_x', 'xxx')`)).rejects.toThrow(/permission denied/);
    await expect(db.as(fora, `insert into public.community_members (community_id, user_id, role) values ($1, $2, 'owner')`, [aberta, fora])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('aberta x fechada', () => {
  it('aberta: entra na hora; quem não é membro vê os posts', async () => {
    expect(await join(membro, aberta)).toBe('active');
    const id = await post(membro, 'show de ontem foi histórico', aberta);
    expect((await communityPosts(fora, aberta)).map((p) => p.id)).toContain(id);
    const [detail] = await db.as<Item>(fora, `select * from public.post_detail($1)`, [id]);
    expect(detail!.community).toMatchObject({ slug: 'fas_da_banda', closed: false });
  });

  it('fechada: vira pedido; post escondido de quem é de fora (lista, detalhe, tabela, comentários, curtir)', async () => {
    expect(await join(membro, fechada)).toBe('pending');
    await expect(post(membro, 'ainda não posso', fechada)).rejects.toThrow(/forbidden/);
    const secreto = await post(dona, 'segredo do clube', fechada);
    for (const u of [fora, membro]) {
      expect(await communityPosts(u, fechada)).toEqual([]);
      expect(await db.as(u, `select * from public.post_detail($1)`, [secreto])).toEqual([]);
      expect(await db.as(u, `select id from public.posts where id = $1`, [secreto])).toEqual([]);
      expect(await db.as(u, `select * from public.post_comments($1)`, [secreto])).toEqual([]);
      await expect(db.as(u, `insert into public.likes (user_id, post_id) values ($1, $2)`, [u, secreto])).rejects.toThrow(/row-level security/);
      await expect(db.as(u, `insert into public.comments (author_id, post_id, body) values ($1, $2, 'oi')`, [u, secreto])).rejects.toThrow(/row-level security/);
    }
    // Pedidos: só moderadores veem e aceitam.
    expect(await db.as(fora, `select * from public.community_members_list($1, 'pending')`, [fechada])).toEqual([]);
    await expect(db.as(fora, `select public.community_respond($1, $2, true)`, [fechada, membro])).rejects.toThrow(/forbidden/);
    const [mine] = await db.as<{ pending_count: number }>(dona, `select * from public.community_get('clube_secreto')`);
    expect(mine!.pending_count).toBe(1);
    await db.as(dona, `select public.community_respond($1, $2, true)`, [fechada, membro]);
    expect((await communityPosts(membro, fechada)).map((p) => p.body)).toEqual(['segredo do clube']);
  });

  it('post de comunidade não vai para perfil, Seguindo, busca nem gênero', async () => {
    const id = await post(membro, 'post exclusivo indie da comunidade', aberta);
    const lp = (await db.sql<{ id: string }>(`insert into public.link_previews (url, platform, kind, title, artist) values ('https://open.spotify.com/track/cmx', 'spotify', 'track', 'X', 'Y') returning id`))[0]!.id;
    await db.sql(`update public.posts set genres = '{indie}', link_preview_id = $2, type = 'music' where id = $1`, [id, lp]);
    await db.sql(`insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [fora, membro]);
    expect((await db.as<Item>(fora, `select * from public.profile_posts($1)`, [membro])).map((p) => p.id)).not.toContain(id);
    expect((await db.as<Item>(fora, `select * from public.feed_following()`)).map((p) => p.id)).not.toContain(id);
    expect((await db.as<Item>(fora, `select * from public.search_posts('exclusivo indie')`)).map((p) => p.id)).not.toContain(id);
    expect((await db.as<Item>(fora, `select * from public.genre_posts('indie')`)).map((p) => p.id)).not.toContain(id);
    // Post geral continua indo para o perfil.
    const geral = await post(membro, 'post geral');
    expect((await db.as<Item>(fora, `select * from public.profile_posts($1)`, [membro])).map((p) => p.id)).toContain(geral);
  });

  it('aba Comunidades sem filtro: só das comunidades de que faço parte', async () => {
    const all = await communityPosts(membro, null);
    expect(new Set(all.map((p) => p.community!.slug))).toEqual(new Set(['fas_da_banda', 'clube_secreto']));
    expect(await communityPosts(fora, null)).toEqual([]);
  });
});

describe('Para você', () => {
  it('post de comunidade só entra se for muito popular e eu for membro', async () => {
    const fa = await createUser(db, 'cm_fa');
    await join(fa, aberta);
    const normal = await post(membro, 'post comum da comunidade', aberta);
    const hit = await post(membro, 'post que bombou na comunidade', aberta);
    await db.sql(`update public.posts set like_count = 50 where id = $1`, [hit]);
    const feed = (await db.as<Item>(fa, `select * from public.feed_for_you(50)`)).map((p) => p.id);
    expect(feed).toContain(hit);
    expect(feed).not.toContain(normal);
    // Quem não é membro não recebe nem o popular.
    expect((await db.as<Item>(fora, `select * from public.feed_for_you(50)`)).map((p) => p.id)).not.toContain(hit);
  });
});

describe('moderação', () => {
  it('dona nomeia moderador; moderador bane membro mas não a dona nem outro moderador', async () => {
    await join(mod, aberta);
    await expect(db.as(membro, `select public.community_set_role($1, $2, 'moderator')`, [aberta, mod])).rejects.toThrow(/forbidden/);
    await db.as(dona, `select public.community_set_role($1, $2, 'moderator')`, [aberta, mod]);
    await expect(db.as(mod, `select public.community_ban($1, $2, true)`, [aberta, dona])).rejects.toThrow(/forbidden/);
    await db.as(mod, `select public.community_ban($1, $2, true)`, [aberta, membro]);
    await expect(join(membro, aberta)).rejects.toThrow(/forbidden/);
    await expect(post(membro, 'banido postando', aberta)).rejects.toThrow(/forbidden/);
    await db.as(mod, `select public.community_ban($1, $2, false)`, [aberta, membro]);
    expect(await join(membro, aberta)).toBe('active');
  });

  it('moderador remove post da comunidade; membro comum não; post geral não', async () => {
    const id = await post(membro, 'spam na comunidade', aberta);
    await expect(db.as(fora, `select public.community_remove_post($1)`, [id])).rejects.toThrow(/forbidden/);
    await db.as(mod, `select public.community_remove_post($1)`, [id]);
    expect(await db.sql(`select id from public.posts where id = $1`, [id])).toEqual([]);
    const geral = await post(membro, 'geral');
    await expect(db.as(mod, `select public.community_remove_post($1)`, [geral])).rejects.toThrow(/not_found/);
  });

  it('só a dona edita; fechada → aberta aceita os pedidos; a dona não sai; passar a comunidade', async () => {
    const pedinte = await createUser(db, 'cm_pedinte');
    expect(await join(pedinte, fechada)).toBe('pending');
    await expect(db.as(mod, `select public.community_update($1, 'Novo', '', 'open', '{}', '{}', 0)`, [fechada])).rejects.toThrow(/forbidden/);
    await db.as(dona, `select public.community_update($1, 'Clube Aberto', 'agora aberto', 'open', '{rock}', '{Radiohead}', 2)`, [fechada]);
    const [c] = await db.as<{ my_status: string; name: string; genres: string[] }>(pedinte, `select * from public.community_get('clube_secreto')`);
    expect(c).toMatchObject({ my_status: 'active', name: 'Clube Aberto', genres: ['rock'] });
    await expect(db.as(dona, `select public.community_leave($1)`, [fechada])).rejects.toThrow(/community_owner_cannot_leave/);
    await db.as(dona, `select public.community_set_role($1, $2, 'owner')`, [fechada, pedinte]);
    const roles = await db.as<{ username: string; role: string }>(dona, `select * from public.community_members_list($1)`, [fechada]);
    expect(roles.find((r) => r.username === 'cm_pedinte')!.role).toBe('owner');
    expect(roles.find((r) => r.username === 'cm_dona')!.role).toBe('moderator');
  });

  it('apagar a comunidade apaga os posts dela', async () => {
    const tmp = await create(fora, 'vai_sumir', 'open');
    const id = await post(fora, 'post que some', tmp);
    await expect(db.as(membro, `select public.community_delete($1)`, [tmp])).rejects.toThrow(/forbidden/);
    await db.as(fora, `select public.community_delete($1)`, [tmp]);
    expect(await db.sql(`select id from public.posts where id = $1`, [id])).toEqual([]);
  });
});

describe('busca e recomendações', () => {
  it('acha pelo nome, @ e artista', async () => {
    const ids = async (q: string) => (await db.as<{ slug: string }>(fora, `select * from public.communities_search($1)`, [q])).map((r) => r.slug);
    expect(await ids('banda')).toContain('fas_da_banda');
    expect(await ids('@fas_da')).toContain('fas_da_banda');
    expect(await ids('arctic monkeys')).toContain('fas_da_banda');
    expect(await ids('x')).toEqual([]);
  });

  it('recomenda pelo gosto (gênero) e não recomenda as minhas', async () => {
    const roqueira = await createUser(db, 'cm_roqueira', { genres: ['rock', 'indie', 'punk'] });
    const recs = (await db.as<{ slug: string; reason: string }>(roqueira, `select * from public.communities_recommended(10)`)).map((r) => r.slug);
    expect(recs).toContain('fas_da_banda');
    expect((await db.as<{ slug: string }>(dona, `select * from public.communities_recommended(10)`)).map((r) => r.slug)).not.toContain('fas_da_banda');
  });

  it('contas para seguir: gente das mesmas comunidades', async () => {
    const novo = await createUser(db, 'cm_novo', { genres: ['jazz', 'blues', 'bossa_nova'] });
    await join(novo, aberta);
    const s = await db.as<{ username: string; reason: string }>(novo, `select * from public.suggested_accounts(30)`);
    expect(s.find((x) => x.username === 'cm_mod')?.reason).toBe('community');
  });

  it('bloqueio: membro bloqueado não aparece na lista de membros', async () => {
    await join(bloqueado, aberta);
    await db.sql(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [fora, bloqueado]);
    const list = await db.as<{ username: string }>(fora, `select * from public.community_members_list($1)`, [aberta]);
    expect(list.map((m) => m.username)).not.toContain('cm_bloq');
  });
});

describe('@ exclusivo (usuário ou comunidade)', () => {
  it('comunidade não pega o @ de um usuário, nem usuário o @ de uma comunidade', async () => {
    await expect(create(fora, 'cm_dona', 'open')).rejects.toThrow(/community_slug_taken/);
    const [{ ok }] = await db.as<{ ok: boolean }>(fora, `select public.community_slug_available('cm_dona') as ok`);
    expect(ok).toBe(false);

    // Cadastro com o @ de uma comunidade.
    const [row] = await db.sql<{ id: string }>(`insert into auth.users (email) values ('handle_novo@teste.dev') returning id`);
    await expect(
      db.as(row!.id, `select public.complete_onboarding('fas_da_banda', 'X', '1995-05-10'::date, '{indie,rock,lo_fi}'::text[], 'pt-BR')`),
    ).rejects.toThrow(/username_taken/);
    const [{ free }] = await db.as<{ free: boolean }>(row!.id, `select public.username_available('fas_da_banda') as free`);
    expect(free).toBe(false);

    // Trocar o @ para o de uma comunidade.
    await expect(db.as(membro, `select public.change_username('fas_da_banda')`)).rejects.toThrow(/username_taken/);
  });

  it('trocar o @ libera o antigo; apagar a comunidade libera o dela', async () => {
    const u = await createUser(db, 'cm_troca');
    await db.as(u, `select public.change_username('cm_troca_nova')`);
    expect((await db.as<{ ok: boolean }>(fora, `select public.community_slug_available('cm_troca') as ok`))[0]!.ok).toBe(true);
    const c = await create(fora, 'libera_depois', 'open');
    await db.as(fora, `select public.community_delete($1)`, [c]);
    expect((await db.as<{ ok: boolean }>(fora, `select public.username_available('libera_depois') as ok`))[0]!.ok).toBe(true);
  });
});
