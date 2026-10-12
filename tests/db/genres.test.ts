import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'gen_ana');
});
afterAll(async () => db.close());

const search = (q: string, limit = 20) => db.as<{ slug: string; name_pt: string; name_en: string; featured: boolean }>(ana, `select * from public.search_genres($1, $2)`, [q, limit]);

describe('catálogo de gêneros', () => {
  it('tem milhares de gêneros, e os 37 de antes continuam em destaque com o nome em português', async () => {
    const [{ total }] = await db.sql<{ total: number }>(`select count(*)::int as total from public.genres`);
    expect(total).toBeGreaterThan(6000);
    const featured = await db.sql<{ slug: string; name_pt: string }>(`select slug, name_pt from public.genres where featured order by slug`);
    expect(featured.length).toBe(37);
    expect(featured.find((g) => g.slug === 'electronic')?.name_pt).toBe('Eletrônica');
    // Nomes que já existiam com outro slug viram o mesmo gênero.
    expect(await db.sql(`select slug from public.genres where slug in ('kpop', 'rb', 'funk_carioca')`)).toEqual([]);
  });

  it('busca: começa com o texto primeiro, destaques e populares antes; acha por nome em português', async () => {
    const rows = await search('dance pop');
    expect(rows[0]).toMatchObject({ slug: 'dance_pop', name_en: 'Dance Pop' });
    const rock = await search('rock', 5);
    expect(rock[0]!.slug).toBe('rock');
    expect(rock.length).toBe(5);
    expect((await search('eletr')).map((r) => r.slug)).toContain('electronic');
    expect(await search('')).toEqual([]);
    await expect(db.anon(`select * from public.search_genres('rock')`)).rejects.toThrow(/permission denied/);
  });

  it('os dois funks têm nomes diferentes; o brasileiro vem primeiro na busca', async () => {
    const rows = await search('funk', 3);
    expect(rows.slice(0, 2).map((r) => [r.slug, r.name_pt])).toEqual([
      ['funk_br', 'Funk brasileiro'],
      ['funk', 'Funk (EUA)'],
    ]);
  });

  it('qualquer gênero do catálogo pode ir para o perfil; inventado não', async () => {
    await db.as(ana, `insert into public.user_genres (user_id, genre) values ($1, 'sertanejo_universitario')`, [ana]);
    await expect(db.as(ana, `insert into public.user_genres (user_id, genre) values ($1, 'genero_inventado_xyz')`, [ana])).rejects.toThrow(/foreign key/);
  });
});
