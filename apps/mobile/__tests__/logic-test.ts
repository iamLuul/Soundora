import { toIsoDate } from '../src/lib/date';
import { AppError, errorCode, errorMessageKey } from '../src/lib/errors';
import { dedupePages, patchPostInCache, toggleLikePatch } from '../src/lib/queries';
import type { FeedItem } from '../src/lib/types';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

export const samplePost: FeedItem = {
  id: 'p1',
  body: 'ouçam',
  genre: 'indie',
  like_count: 2,
  comment_count: 1,
  created_at: new Date().toISOString(),
  liked_by_me: false,
  author_id: 'u1',
  author_username: 'luul',
  author_display_name: 'Luul',
  author_avatar_url: null,
  preview_url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  preview_platform: 'spotify',
  preview_kind: 'track',
  preview_title: 'Bohemian Rhapsody',
  preview_artist: 'Queen',
  preview_image_url: null,
  score: 1,
};

describe('erros', () => {
  test('erro levantado pelo banco vira chave de tradução', () => {
    expect(errorMessageKey({ message: 'username_taken', code: 'P0001' })).toBe('errors.username_taken');
    expect(errorMessageKey({ message: 'needs_guardian' })).toBe('age.needs_guardian');
    expect(errorMessageKey(new AppError('unsupported'))).toBe('errors.unsupported');
  });
  test('erro desconhecido vira genérico', () => {
    expect(errorCode(new Error('boom'))).toBe('generic');
    expect(errorMessageKey(null)).toBe('errors.generic');
  });
  test('host bloqueado aparece como link não suportado', () => {
    expect(errorMessageKey(new AppError('blocked_host'))).toBe('errors.unsupported');
  });
});

describe('curtida otimista', () => {
  test('alterna curtida e contador', () => {
    const liked = toggleLikePatch(samplePost);
    expect(liked).toMatchObject({ liked_by_me: true, like_count: 3 });
    expect(toggleLikePatch(liked)).toMatchObject({ liked_by_me: false, like_count: 2 });
  });
  test('aplica só no post certo, em todas as páginas', () => {
    const other = { ...samplePost, id: 'p2' };
    const data = { pages: [[samplePost], [other]], pageParams: [0, 1] };
    const out = patchPostInCache(data, 'p2', toggleLikePatch)!;
    expect(out.pages[0]![0]).toBe(samplePost);
    expect(out.pages[1]![0]).toMatchObject({ id: 'p2', liked_by_me: true });
  });
  test('também no formato do feed ({ items, openedAt })', () => {
    const data = { pages: [{ items: [samplePost], openedAt: '2026-10-10T12:00:00Z' }], pageParams: [{ page: 0, openedAt: null }] };
    const out = patchPostInCache(data, samplePost.id, toggleLikePatch)!;
    expect(out.pages[0]).toMatchObject({ openedAt: '2026-10-10T12:00:00Z', items: [{ liked_by_me: true }] });
  });
});

describe('feed sem repetidos', () => {
  test('um post que aparece em duas páginas fica só na primeira', () => {
    const a = samplePost;
    const b = { ...samplePost, id: 'b' };
    const c = { ...samplePost, id: 'c' };
    expect(dedupePages([[a, b], [b, c]]).map((p) => p.map((x) => x.id))).toEqual([[samplePost.id, 'b'], ['c']]);
  });
});

describe('data de nascimento', () => {
  test('monta AAAA-MM-DD com zeros', () => {
    expect(toIsoDate('5', '3', '2001')).toBe('2001-03-05');
  });
});
