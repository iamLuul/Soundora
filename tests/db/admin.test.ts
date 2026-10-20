import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let admin: string;
let ana: string;
let troll: string;

async function post(author: string, body = 'post') {
  const preview = await createPreview(db, `https://open.spotify.com/track/adm${crypto.randomUUID().replace(/-/g, '').slice(0, 19)}`);
  const [row] = await db.as<{ id: string }>(author, `insert into public.posts (author_id, link_preview_id, body) values ($1, $2, $3) returning id`, [author, preview, body]);
  return row!.id;
}

beforeAll(async () => {
  db = await connect();
  admin = await createUser(db, 'adm_chefe');
  ana = await createUser(db, 'adm_ana');
  troll = await createUser(db, 'adm_troll');
  await db.sql(`insert into public.admins (user_id) values ($1)`, [admin]);
});
afterAll(async () => db.close());

describe('painel admin: acesso', () => {
  it('quem não é admin não usa nenhuma função do painel', async () => {
    for (const sql of [
      `select * from public.admin_overview()`,
      `select * from public.admin_reports()`,
      `select * from public.admin_users()`,
      `select public.admin_set_verified('${ana}', true)`,
      `select public.admin_suspend('${troll}', 7)`,
      `select public.admin_resolve('post', '${ana}', 'dismiss')`,
    ]) {
      await expect(db.as(ana, sql)).rejects.toThrow(/forbidden/);
      await expect(db.anon(sql)).rejects.toThrow(/permission denied/);
    }
    // Nem o registro de ações.
    expect(await db.as(ana, `select * from public.admin_actions`)).toEqual([]);
  });
});

describe('painel admin: denúncias', () => {
  it('agrupa por conteúdo; remover apaga o post e fecha as denúncias; dispensar só fecha', async () => {
    const bad = await post(troll, 'conteúdo ofensivo');
    const ok = await post(troll, 'inofensivo');
    await db.as(ana, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'hate')`, [ana, bad]);
    await db.as(admin, `insert into public.reports (reporter_id, target_type, target_id, reason, details) values ($1, 'post', $2, 'harassment', 'xingou')`, [admin, bad]);
    await db.as(ana, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [ana, ok]);

    const open = await db.as<{ target_id: string; report_count: number; reasons: string[]; preview: string; author_username: string; details: string[] }>(
      admin,
      `select * from public.admin_reports('open')`,
    );
    const row = open.find((r) => r.target_id === bad)!;
    expect(row).toMatchObject({ report_count: 2, preview: 'conteúdo ofensivo', author_username: 'adm_troll', details: ['xingou'] });
    expect(row.reasons.sort()).toEqual(['harassment', 'hate']);
    expect(open[0]!.target_id).toBe(bad); // o mais denunciado primeiro

    expect(await db.as(admin, `select public.admin_resolve('post', $1, 'remove') as n`, [bad])).toEqual([{ n: 2 }]);
    expect(await db.sql(`select id from public.posts where id = $1`, [bad])).toEqual([]);
    await db.as(admin, `select public.admin_resolve('post', $1, 'dismiss')`, [ok]);
    expect(await db.sql(`select id from public.posts where id = $1`, [ok])).toHaveLength(1);
    const statuses = await db.sql<{ status: string }>(`select distinct status from public.reports where target_id = $1`, [ok]);
    expect(statuses).toEqual([{ status: 'dismissed' }]);

    const log = await db.as<{ action: string }>(admin, `select action from public.admin_actions order by id`);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['remove', 'dismiss']));
  });

  it('perfil denunciado não se apaga pelo painel (suspende-se)', async () => {
    await expect(db.as(admin, `select public.admin_resolve('profile', $1, 'remove')`, [troll])).rejects.toThrow(/cannot_remove_profile/);
  });
});

describe('painel admin: usuários', () => {
  it('verifica e tira a verificação', async () => {
    await db.as(admin, `select public.admin_set_verified($1, true)`, [ana]);
    expect((await db.sql<{ verified: boolean }>(`select verified from public.profiles where id = $1`, [ana]))[0]!.verified).toBe(true);
    await db.as(admin, `select public.admin_set_verified($1, false)`, [ana]);
    expect((await db.sql<{ verified: boolean }>(`select verified from public.profiles where id = $1`, [ana]))[0]!.verified).toBe(false);
  });

  it('busca por @ e mostra denúncias abertas contra a pessoa', async () => {
    const p = await post(troll, 'de novo');
    await db.as(ana, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [ana, p]);
    const rows = await db.as<{ username: string; open_reports: number; is_admin: boolean }>(admin, `select * from public.admin_users('@adm_troll')`);
    expect(rows[0]).toMatchObject({ username: 'adm_troll', open_reports: 1, is_admin: false });
    const me = await db.as<{ is_admin: boolean }>(admin, `select * from public.admin_users('adm_chefe')`);
    expect(me[0]!.is_admin).toBe(true);
  });

  it('suspensa, a conta não posta, comenta, curte, segue nem denuncia; reativada, volta', async () => {
    const target = await post(ana, 'da ana');
    await db.as(admin, `select public.admin_suspend($1, 7)`, [troll]);
    const until = (await db.sql<{ suspended_until: Date }>(`select suspended_until from public.profiles where id = $1`, [troll]))[0]!.suspended_until;
    expect(+until).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    await expect(post(troll)).rejects.toThrow(/account_suspended/);
    await expect(db.as(troll, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'oi')`, [target, troll])).rejects.toThrow(/account_suspended/);
    await expect(db.as(troll, `insert into public.likes (user_id, post_id) values ($1, $2)`, [troll, target])).rejects.toThrow(/account_suspended/);
    await expect(db.as(troll, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [troll, ana])).rejects.toThrow(/account_suspended/);
    await expect(
      db.as(troll, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [troll, target]),
    ).rejects.toThrow(/account_suspended/);

    await db.as(admin, `select public.admin_suspend($1, 0)`, [troll]);
    expect(await post(troll, 'voltei')).toBeTruthy();

    // Sem data para voltar.
    await db.as(admin, `select public.admin_suspend($1, null)`, [troll]);
    expect((await db.sql<{ inf: boolean }>(`select suspended_until = 'infinity' as inf from public.profiles where id = $1`, [troll]))[0]!.inf).toBe(true);
    await db.as(admin, `select public.admin_suspend($1, 0)`, [troll]);
  });

  it('filtros (verificados, comuns, admin, suspensos, com denúncia) e ordenação', async () => {
    const famosa = await createUser(db, 'adm_famosa');
    const fa1 = await createUser(db, 'adm_fa1');
    const fa2 = await createUser(db, 'adm_fa2');
    for (const f of [fa1, fa2]) await db.as(f, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [f, famosa]);
    await db.as(admin, `select public.admin_set_verified($1, true)`, [famosa]);
    await db.as(admin, `select public.admin_suspend($1, 7)`, [fa2]);

    type U = { username: string; follower_count: number };
    const list = async (filter: string, sort = 'relevance') =>
      // Só as contas deste arquivo (a busca por "adm_" também acha, por exemplo, "discadmin" de outro arquivo).
      (await db.as<U>(admin, `select username, follower_count from public.admin_users('adm_', $1, $2, 100)`, [filter, sort]))
        .map((u) => u.username)
        .filter((u) => u.startsWith('adm_'));

    expect(await list('verified')).toEqual(['adm_famosa']);
    expect(await list('admin')).toEqual(['adm_chefe']);
    expect(await list('suspended')).toEqual(['adm_fa2']);
    expect(await list('reported')).toContain('adm_troll');
    expect(await list('reported')).not.toContain('adm_fa1');
    const regular = await list('regular');
    expect(regular).toContain('adm_fa1');
    expect(regular).not.toEqual(expect.arrayContaining(['adm_famosa', 'adm_chefe', 'adm_fa2']));

    const byFollowers = await db.as<U>(admin, `select username, follower_count from public.admin_users('adm_', 'all', 'followers_desc', 100)`);
    expect(byFollowers[0]).toEqual({ username: 'adm_famosa', follower_count: 2 });
    const fewest = await list('all', 'followers_asc');
    expect(fewest.at(-1)).toBe('adm_famosa');
    const az = await list('all', 'name_asc');
    expect(az).toEqual([...az].sort());
    expect(await list('all', 'name_desc')).toEqual([...az].reverse());

    await expect(db.as(admin, `select * from public.admin_users('', 'hackers')`)).rejects.toThrow(/invalid_request/);
    await db.as(admin, `select public.admin_suspend($1, 0)`, [fa2]);
  });

  it('admin não suspende a si mesmo nem outro admin', async () => {
    await expect(db.as(admin, `select public.admin_suspend($1, 7)`, [admin])).rejects.toThrow(/cannot_suspend_admin/);
  });

  it('o app não muda a própria suspensão', async () => {
    await expect(db.as(troll, `update public.profiles set suspended_until = null where id = $1`, [troll])).rejects.toThrow(/permission denied/);
  });

  it('resumo do painel', async () => {
    const [o] = await db.as<{ open_reports: number; suspended: number }>(admin, `select * from public.admin_overview()`);
    expect(o!.open_reports).toBeGreaterThanOrEqual(1);
    // Outros arquivos podem deixar contas suspensas: o número tem de bater com o banco.
    const [n] = await db.sql<{ n: number }>(`select count(*)::int as n from public.profiles where suspended_until > now()`);
    expect(o!.suspended).toBe(n!.n);
  });
});
