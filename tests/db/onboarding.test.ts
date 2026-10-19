import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => db.close());

function yearsAgo(years: number, extraDays = 0): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d.toISOString().slice(0, 10);
}

async function onboard(id: string, username: string, birthdate: string, genres = ['indie', 'rock', 'pop']) {
  return db.as(id, `select * from public.complete_onboarding($1, 'Nome', $2::date, $3::text[], 'en')`, [username, birthdate, genres]);
}

describe('complete_onboarding', () => {
  it('cria perfil, dados privados e gêneros', async () => {
    const id = await createUser(db, 'emily', { onboard: false });
    const [profile] = await onboard(id, 'Emily', yearsAgo(25));
    expect(profile).toMatchObject({ id, username: 'emily', locale: 'en' });
    const [priv] = await db.sql(`select is_minor from public.profile_private where user_id = $1`, [id]);
    expect(priv).toEqual({ is_minor: false });
    const genres = await db.sql(`select genre from public.user_genres where user_id = $1 order by genre`, [id]);
    expect(genres.map((g) => g.genre)).toEqual(['indie', 'pop', 'rock']);
  });

  it('recusa abaixo da idade mínima', async () => {
    const id = await createUser(db, 'kid', { onboard: false });
    await expect(onboard(id, 'kid', yearsAgo(12))).rejects.toThrow('too_young');
  });

  it('MVP: abaixo de 16 anos não entra (idade mínima 16)', async () => {
    const id = await createUser(db, 'teen', { onboard: false });
    await expect(onboard(id, 'teen', yearsAgo(14))).rejects.toThrow('too_young');
    await expect(onboard(id, 'teen', yearsAgo(15))).rejects.toThrow('too_young');
  });

  it('com a idade mínima em 13, 13 a 15 anos ficam bloqueados enquanto o vínculo com responsável não existe', async () => {
    await db.sql(`update public.app_config set min_age = 13`);
    try {
      const id = await createUser(db, 'teen13', { onboard: false });
      await expect(onboard(id, 'teen13', yearsAgo(14))).rejects.toThrow('needs_guardian');
    } finally {
      await db.sql(`update public.app_config set min_age = 16`);
    }
  });

  it('16 e 17 anos entram marcados como menores', async () => {
    const id = await createUser(db, 'teen17', { onboard: false });
    await onboard(id, 'teen17', yearsAgo(17));
    const [priv] = await db.sql(`select is_minor from public.profile_private where user_id = $1`, [id]);
    expect(priv).toEqual({ is_minor: true });
  });

  it('respeita a idade mínima configurada em app_config', async () => {
    await db.sql(`update public.app_config set min_age = 18`);
    try {
      const id = await createUser(db, 'seventeen', { onboard: false });
      await expect(onboard(id, 'seventeen', yearsAgo(17))).rejects.toThrow('too_young');
    } finally {
      await db.sql(`update public.app_config set min_age = 16`);
    }
  });

  it('username repetido vira erro legível', async () => {
    const id = await createUser(db, 'dup1', { onboard: false });
    await expect(onboard(id, 'emily', yearsAgo(30))).rejects.toThrow('username_taken');
  });

  it('exige ao menos 3 gêneros', async () => {
    const id = await createUser(db, 'fewgenres', { onboard: false });
    await expect(onboard(id, 'fewgenres', yearsAgo(30), ['indie'])).rejects.toThrow('genres_too_few');
  });

  it('não roda duas vezes', async () => {
    const id = await createUser(db, 'twice');
    await expect(onboard(id, 'twice2', yearsAgo(30))).rejects.toThrow('already_onboarded');
  });

  it('visitante sem login não consegue chamar', async () => {
    await expect(db.anon(`select public.complete_onboarding('x', 'x', '1990-01-01', array['indie','rock','pop'])`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
