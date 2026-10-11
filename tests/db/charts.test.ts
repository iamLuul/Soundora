import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createUser, type Db } from './helpers.ts';

let db: Db;
let ana: string;
let bia: string;

const platformOf = async (user: string) =>
  (await db.as<{ streaming_platform: string | null }>(user, `select streaming_platform from public.profile_private where user_id = $1`, [user]))[0]
    ?.streaming_platform;

beforeAll(async () => {
  db = await connect();
  ana = await createUser(db, 'chart_ana');
  bia = await createUser(db, 'chart_bia', { onboard: false });
});
afterAll(async () => db.close());

describe('plataforma de streaming da pessoa', () => {
  it('é escolhida no cadastro e só a própria pessoa vê', async () => {
    await db.as(bia, `select public.complete_onboarding('chart_bia', 'Bia', '1990-01-01', array['indie','rock','pop'], 'pt-BR', 'spotify')`);
    expect(await platformOf(bia)).toBe('spotify');
    expect((await db.as(ana, `select streaming_platform from public.profile_private where user_id = $1`, [bia])).length).toBe(0);
  });

  it('cadastro com plataforma desconhecida é recusado', async () => {
    const caio = await createUser(db, 'chart_caio', { onboard: false });
    await expect(
      db.as(caio, `select public.complete_onboarding('chart_caio', 'Caio', '1990-01-01', array['indie','rock','pop'], 'pt-BR', 'napster')`),
    ).rejects.toThrow(/invalid_platform/);
  });

  it('dá para trocar depois, só por uma das plataformas da lista, e só a minha', async () => {
    expect(await platformOf(ana)).toBeNull();
    await db.as(ana, `select public.set_streaming_platform('deezer')`);
    expect(await platformOf(ana)).toBe('deezer');
    await expect(db.as(ana, `select public.set_streaming_platform('https://evil.example.com')`)).rejects.toThrow(/invalid_platform/);
    await expect(db.as(ana, `update public.profile_private set streaming_platform = 'tidal' where user_id = $1`, [ana])).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select public.set_streaming_platform('spotify')`)).rejects.toThrow(/permission denied/);
    expect(await platformOf(bia)).toBe('spotify');
  });
});

describe('cache do ranking', () => {
  it('o app não lê nem grava o cache (só a Edge Function, com a chave secreta)', async () => {
    await db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date, '[]')`);
    for (const table of ['music_chart_snapshots', 'track_platform_links']) {
      await expect(db.as(ana, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
      await expect(db.anon(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(db.as(ana, `insert into public.music_chart_snapshots (taken_on, entries) values (current_date - 1, '[]')`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('só guarda link de faixa da Deezer ou da Apple Music, e só 60 dias de ranking', async () => {
    await expect(db.sql(`insert into public.track_platform_links (source_url, links) values ('https://evil.example.com/track/1', '{}')`)).rejects.toThrow(
      /check/,
    );
    await db.sql(
      `insert into public.track_platform_links (source_url, links) values ('https://www.deezer.com/track/1', '{}'), ('https://music.apple.com/us/album/x/1?i=2', '{}')`,
    );
    await db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date - 90, '[]')`);
    await db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date - 2, '[]')`);
    const days = await db.sql<{ d: number }>(`select current_date - taken_on as d from public.music_chart_snapshots order by taken_on`);
    expect(days.map((r) => r.d)).toEqual([2, 0]);
  });
});
