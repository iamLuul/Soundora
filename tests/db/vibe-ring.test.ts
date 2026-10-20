import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

// Anel roxo da foto nos posts: authors_with_vibes diz quem tem vibe ativa que eu posso ver.
let db: Db;
let eu: string;
let ativa: string;
let vencida: string;
let semVibe: string;
let privada: string;
let privadaSigo: string;
let bloqueou: string;

const vibe = (user: string) => db.as(user, `select public.vibe_create(p_kind => 'text', p_text => 'oi', p_style => 'violet')`);
const ring = (user: string, ids: string[]) =>
  db.as<{ authors_with_vibes: string }>(user, `select public.authors_with_vibes($1::uuid[])`, [ids]).then((r) => r.map((x) => x.authors_with_vibes).sort());

beforeAll(async () => {
  db = await connect();
  eu = await createUser(db, 'ring_eu');
  ativa = await createUser(db, 'ring_ativa');
  vencida = await createUser(db, 'ring_vencida');
  semVibe = await createUser(db, 'ring_sem');
  privada = await createUser(db, 'ring_privada');
  privadaSigo = await createUser(db, 'ring_privada2');
  bloqueou = await createUser(db, 'ring_bloqueou');
  for (const u of [eu, ativa, vencida, privada, privadaSigo, bloqueou]) await vibe(u);
  // Vibe de 25 horas atrás: já venceu.
  await db.sql(`update public.vibes set created_at = now() - interval '25 hours' where author_id = $1`, [vencida]);
  await db.sql(`update public.profiles set is_private = true where id = any($1::uuid[])`, [[privada, privadaSigo]]);
  await db.sql(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [eu, privadaSigo]);
  await db.as(bloqueou, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [bloqueou, eu]);
});
afterAll(async () => db.close());

describe('authors_with_vibes', () => {
  it('só quem tem vibe ativa que eu posso ver (inclusive eu)', async () => {
    const all = [eu, ativa, vencida, semVibe, privada, privadaSigo, bloqueou];
    expect(await ring(eu, all)).toEqual([eu, ativa, privadaSigo].sort());
  });

  it('sem login, nada', async () => {
    await expect(db.anon(`select public.authors_with_vibes($1::uuid[])`, [[ativa]])).rejects.toThrow(/permission denied/);
  });

  it('no máximo 200 autores por pedido', async () => {
    const many = [...Array(250).keys()].map(() => crypto.randomUUID());
    many[220] = ativa;
    expect(await ring(eu, many)).toEqual([]);
    many[10] = ativa;
    expect(await ring(eu, many)).toEqual([ativa]);
  });
});
