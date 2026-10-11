import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'dl_ana');
  bia = await createUser(db, 'dl_bia');
});
afterAll(async () => db.close());

describe('Descobrir: músicas curtidas', () => {
  it('lista só as minhas curtidas (não os pulos), a mais recente primeiro, com álbum', async () => {
    const a = await createPreview(db, 'https://www.deezer.com/track/9000001', 'Primeira');
    const b = await createPreview(db, 'https://www.deezer.com/track/9000002', 'Segunda');
    const skip = await createPreview(db, 'https://www.deezer.com/track/9000003', 'Pulada');
    await db.sql(`update public.link_previews set album = 'Disco' where id = $1`, [b]);
    await db.as(ana, `select public.discover_swipe($1, true)`, [a]);
    await db.sql(`update public.discover_swipes set created_at = now() - interval '1 hour' where link_preview_id = $1`, [a]);
    await db.as(ana, `select public.discover_swipe($1, true)`, [b]);
    await db.as(ana, `select public.discover_swipe($1, false)`, [skip]);
    await db.as(bia, `select public.discover_swipe($1, true)`, [skip]);

    const rows = await db.as<{ title: string; album: string | null }>(ana, `select title, album from public.discover_liked()`);
    expect(rows).toEqual([
      { title: 'Segunda', album: 'Disco' },
      { title: 'Primeira', album: null },
    ]);
    // Descurtir (swipe de novo como pular) tira da lista.
    await db.as(ana, `select public.discover_swipe($1, false)`, [b]);
    expect((await db.as<{ title: string }>(ana, `select title from public.discover_liked()`)).map((r) => r.title)).toEqual(['Primeira']);
    await expect(db.anon(`select * from public.discover_liked()`)).rejects.toThrow(/permission denied/);
  });

  it('cache de buscas fechado para o app; links por plataforma aceitam qualquer link https de faixa', async () => {
    await expect(db.as(ana, `select * from public.track_lookups`)).rejects.toThrow(/permission denied/);
    await db.sql(`insert into public.track_platform_links (source_url, links) values ('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', '{}')`);
    await expect(db.sql(`insert into public.track_platform_links (source_url, links) values ('javascript:alert(1)', '{}')`)).rejects.toThrow(/check/);
    await expect(db.sql(`update public.link_previews set artist_image_url = 'http://x.com/a.jpg' where url like 'https://www.deezer.com/track/9000001'`)).rejects.toThrow(/check/);
  });
});
