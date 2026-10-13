import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createPreview, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;
let chato: string;
const songs: string[] = [];

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'fav_ana');
  bia = await createUser(db, 'fav_bia');
  chato = await createUser(db, 'fav_chato');
  for (let i = 0; i < 6; i++) songs.push(await createPreview(db, `https://open.spotify.com/track/fav${String(i).padStart(19, '0')}`, `Música ${i}`));
});
afterAll(async () => db.close());

type Fav = { slot: number; link_preview_id: string; title: string };
const favs = (as: string, of: string) => db.as<Fav>(as, `select * from public.favorite_songs($1)`, [of]);

describe('músicas favoritas do perfil', () => {
  it('guarda até 5 na ordem escolhida; trocar substitui a lista; outras pessoas veem', async () => {
    await db.as(ana, `select public.set_favorite_songs($1)`, [[songs[2], songs[0], songs[1]]]);
    expect((await favs(bia, ana)).map((f) => [f.slot, f.title])).toEqual([
      [1, 'Música 2'],
      [2, 'Música 0'],
      [3, 'Música 1'],
    ]);
    await db.as(ana, `select public.set_favorite_songs($1)`, [[songs[4]]]);
    expect((await favs(ana, ana)).map((f) => f.title)).toEqual(['Música 4']);
    await db.as(ana, `select public.set_favorite_songs($1)`, [[]]);
    expect(await favs(ana, ana)).toEqual([]);
  });

  it('mais de 5, repetida ou álbum: recusa; sem login não usa; o app não mexe na tabela', async () => {
    await expect(db.as(ana, `select public.set_favorite_songs($1)`, [songs])).rejects.toThrow(/invalid_request/);
    await expect(db.as(ana, `select public.set_favorite_songs($1)`, [[songs[0], songs[0]]])).rejects.toThrow(/invalid_request/);
    const [album] = await db.sql<{ id: string }>(
      `insert into public.link_previews (url, platform, kind, title) values ('https://www.deezer.com/album/fav1', 'deezer', 'album', 'Álbum') returning id`,
    );
    await expect(db.as(ana, `select public.set_favorite_songs($1)`, [[album!.id]])).rejects.toThrow(/favorite_needs_song/);
    await expect(db.anon(`select * from public.favorite_songs('${ana}')`)).rejects.toThrow(/permission denied/);
    await expect(db.as(ana, `insert into public.profile_favorite_songs (user_id, slot, link_preview_id) values ($1, 1, $2)`, [ana, songs[0]])).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.as(ana, `select * from public.profile_favorite_songs`)).rejects.toThrow(/permission denied/);
  });

  it('bloqueio: não vê as favoritas de quem bloqueou ou foi bloqueado', async () => {
    await db.as(chato, `select public.set_favorite_songs($1)`, [[songs[5]]]);
    expect(await favs(bia, chato)).toHaveLength(1);
    await db.as(bia, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [bia, chato]);
    expect(await favs(bia, chato)).toEqual([]);
    expect(await favs(chato, bia)).toEqual([]);
  });
});
