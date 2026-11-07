import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let dona: string;
let mod: string;
let outra: string;
let comunidade: string;

/** Como a Edge Function chama: papel service_role (chave secreta). */
async function asService(sql: string) {
  try {
    await db.sql(`begin; set local role service_role;`);
    const rows = await db.sql<{ previous: string | null }>(sql);
    await db.sql('commit');
    return rows;
  } catch (err) {
    await db.sql('rollback');
    throw err;
  }
}
const setAvatar = (user: string, path: string | null) =>
  asService(`select public.community_set_avatar('${user}', '${comunidade}', ${path ? `'${path}'` : 'null'}) as previous`).then((r) => r[0]!.previous);

beforeAll(async () => {
  db = await connect();
  dona = await createUser(db, 'cav_dona');
  mod = await createUser(db, 'cav_mod');
  outra = await createUser(db, 'cav_outra');
  comunidade = (await db.as<{ id: string }>(dona, `select public.community_create('cav_fas', 'Fãs com foto', '', 'open', '{}', '{}', 2) as id`))[0]!.id;
  await db.as(mod, `select public.community_join($1)`, [comunidade]);
  await db.as(dona, `select public.community_set_role($1, $2, 'moderator')`, [comunidade, mod]);
});
afterAll(async () => db.close());

describe('foto da comunidade', () => {
  it('a dona troca pela função do servidor; a foto aparece em todo lugar e a anterior volta para apagar', async () => {
    const p1 = `community-avatars/${comunidade}/avatar-1730000000000.webp`;
    const p2 = `community-avatars/${comunidade}/avatar-1730000000001.webp`;
    expect(await setAvatar(dona, p1)).toBeNull();
    expect(await setAvatar(dona, p2)).toBe(p1);

    const [got] = await db.as<{ avatar_url: string; color: number }>(outra, `select avatar_url, color from public.community_get('cav_fas')`);
    expect(got).toEqual({ avatar_url: p2, color: 2 });
    expect(await db.as(dona, `select avatar_url from public.my_communities()`)).toEqual([{ avatar_url: p2 }]);
    expect(await db.as(outra, `select avatar_url from public.communities_search('com foto')`)).toEqual([{ avatar_url: p2 }]);

    const [post] = await db.as<{ id: string }>(dona, `select public.post_create(p_body => 'oi', p_community => $1) as id`, [comunidade]);
    const items = await db.as<{ id: string; community: { avatar_url: string } }>(outra, `select id, community from public.community_posts($1)`, [comunidade]);
    expect(items.find((i) => i.id === post!.id)?.community.avatar_url).toBe(p2);

    expect(await setAvatar(dona, null)).toBe(p2);
  });

  it('moderador, outra pessoa e o app não trocam; caminho fora da pasta da comunidade é recusado', async () => {
    const path = `community-avatars/${comunidade}/avatar-1730000000002.webp`;
    await expect(setAvatar(mod, path)).rejects.toThrow(/forbidden/);
    await expect(setAvatar(outra, path)).rejects.toThrow(/forbidden/);
    await expect(db.as(dona, `select public.community_set_avatar($1, $2, $3)`, [dona, comunidade, path])).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select public.community_set_avatar($1, $2, $3)`, [dona, comunidade, path])).rejects.toThrow(/permission denied/);
    await expect(db.as(dona, `update public.communities set avatar_url = $1 where id = $2`, [path, comunidade])).rejects.toThrow(/permission denied/);
    await expect(setAvatar(dona, `avatars/${dona}/avatar-1730000000000.webp`)).rejects.toThrow(/communities_avatar_path/);
    await expect(setAvatar(dona, `community-avatars/${crypto.randomUUID()}/avatar-1730000000000.webp`)).rejects.toThrow(/communities_avatar_path/);
    await expect(setAvatar(dona, 'https://site-de-fora.com/foto.jpg')).rejects.toThrow(/communities_avatar_path/);
  });
});
