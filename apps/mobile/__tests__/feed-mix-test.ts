// Aba Seguindo: posts e reviews numa lista só, pela data, sem a ordem mudar ao rolar.
import type { AlbumReview } from '../src/lib/api';
import { mixByDate } from '../src/lib/feed-mix';
import type { FeedItem } from '../src/lib/types';

const post = (id: string, at: string) => ({ id, created_at: `2026-10-${at}T12:00:00Z` }) as FeedItem;
const review = (id: string, at: string) => ({ id, created_at: `2026-10-${at}T12:00:00Z` }) as AlbumReview;
const ids = (r: ReturnType<typeof mixByDate>) => r.entries.map((e) => `${e.kind[0]}:${e.item.id}`);

test('sem mais páginas: tudo junto, do mais novo ao mais velho', () => {
  const r = mixByDate({ items: [post('a', '30'), post('b', '20')], hasMore: false }, { items: [review('x', '25'), review('y', '10')], hasMore: false });
  expect(ids(r)).toEqual(['p:a', 'r:x', 'p:b', 'r:y']);
  expect(r.loadPosts || r.loadReviews).toBe(false);
});

test('reviews ainda têm páginas: posts mais velhos que a última review carregada esperam', () => {
  const r = mixByDate({ items: [post('a', '30'), post('b', '05')], hasMore: false }, { items: [review('x', '25'), review('y', '20')], hasMore: true });
  expect(ids(r)).toEqual(['p:a', 'r:x', 'r:y']);
  expect(r).toMatchObject({ loadPosts: false, loadReviews: true });
});

test('as duas com páginas: a fronteira é a mais nova das duas pontas, e só ela carrega', () => {
  const r = mixByDate({ items: [post('a', '30'), post('b', '22')], hasMore: true }, { items: [review('x', '28'), review('y', '15')], hasMore: true });
  expect(ids(r)).toEqual(['p:a', 'r:x', 'p:b']);
  expect(r).toMatchObject({ loadPosts: true, loadReviews: false });
});

test('ninguém com reviews: só os posts', () => {
  const r = mixByDate({ items: [post('a', '30')], hasMore: true }, { items: [], hasMore: false });
  expect(ids(r)).toEqual(['p:a']);
  expect(r.loadPosts).toBe(true);
});
