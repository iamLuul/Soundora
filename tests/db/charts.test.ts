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

  it('só guarda link https, e só 365 dias de ranking (o ano do Trending usa 360)', async () => {
    await expect(db.sql(`insert into public.track_platform_links (source_url, links) values ('ftp://evil.example.com/track/1', '{}')`)).rejects.toThrow(
      /check/,
    );
    await db.sql(
      `insert into public.track_platform_links (source_url, links) values ('https://www.deezer.com/track/1', '{}'), ('https://music.apple.com/us/album/x/1?i=2', '{}')`,
    );
    await db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date - 400, '[]')`);
    await db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date - 90, '[]')`);
    await db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date - 2, '[]')`);
    const days = await db.sql<{ d: number }>(`select current_date - taken_on as d from public.music_chart_snapshots order by taken_on`);
    expect(days.map((r) => r.d)).toEqual([90, 2, 0]);
    await db.sql(`delete from public.music_chart_snapshots`);
  });
});

describe('ranking da semana, do mês e do ano (pontos por posição)', () => {
  const snap = (daysAgo: number, keys: string[]) =>
    db.sql(`insert into public.music_chart_snapshots (taken_on, entries) values (current_date - $1::int, $2::jsonb)`, [
      daysAgo,
      JSON.stringify(keys.map((key, i) => ({ key, position: i + 1, title: key.toUpperCase(), artist: 'Artista' }))),
    ]);
  const ranking = (from: number, to: number) =>
    db.sql<{ key: string; points: string; days: number; best: number; entry: { title: string; position: number } }>(
      `select * from public.music_chart_ranking(current_date - $1::int, current_date - $2::int)`,
      [from, to],
    );

  beforeAll(async () => {
    await db.sql(`delete from public.music_chart_snapshots`);
    // x: 1º num dia só (50). y: 2º em dois dias (98). z: 3º em dois dias (96). w: 1º há 40 dias (fora do mês).
    await snap(0, ['x', 'y', 'z']);
    await snap(1, ['q', 'y', 'z']);
    await snap(40, ['w']);
  });

  it('constância ganha de um dia só no topo; a janela de dias é respeitada', async () => {
    const month = await ranking(29, 0);
    expect(month.map((r) => [r.key, Number(r.points), r.days, r.best])).toEqual([
      ['y', 98, 2, 2],
      ['z', 96, 2, 3],
      ['q', 50, 1, 1],
      ['x', 50, 1, 1],
    ]);
    // Os dados da música vêm da foto mais recente em que ela apareceu.
    expect(month[0]!.entry.title).toBe('Y');
    expect((await ranking(359, 0)).map((r) => r.key)).toContain('w');
  });

  it('o app não chama a conta (só a Edge Function, com a chave secreta)', async () => {
    await expect(db.as(ana, `select * from public.music_chart_ranking(current_date - 6, current_date)`)).rejects.toThrow(/permission denied/);
    await expect(db.anon(`select * from public.music_chart_ranking(current_date - 6, current_date)`)).rejects.toThrow(/permission denied/);
  });

  it('a tarefa diária sem os segredos do Vault não faz nada (e o app não chama)', async () => {
    await db.sql(`select private.record_music_chart()`);
    await expect(db.as(ana, `select private.record_music_chart()`)).rejects.toThrow(/permission denied/);
  });
});
