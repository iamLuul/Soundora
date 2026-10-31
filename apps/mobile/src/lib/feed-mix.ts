// Aba Seguindo: posts e reviews de quem eu sigo numa lista só, pela data.
//
// As duas listas chegam em páginas separadas (cada uma com o seu cursor). Para a ordem nunca
// mudar com a rolagem, só aparece o que é mais novo que a "fronteira": a data do último item
// carregado da lista que ainda tem mais páginas (abaixo dela pode faltar algo da outra lista).
// O resto espera a próxima página.
import type { AlbumReview } from './api';
import type { FeedItem } from './types';

export type MixedEntry = { kind: 'post'; item: FeedItem } | { kind: 'review'; item: AlbumReview };

interface Stream<T> {
  items: T[];
  hasMore: boolean;
}

const time = (iso: string) => new Date(iso).getTime();

export function mixByDate(posts: Stream<FeedItem>, reviews: Stream<AlbumReview>): { entries: MixedEntry[]; loadPosts: boolean; loadReviews: boolean } {
  const tail = (s: Stream<{ created_at: string }>) => (s.hasMore && s.items.length ? time(s.items[s.items.length - 1]!.created_at) : -Infinity);
  const postTail = tail(posts);
  const reviewTail = tail(reviews);
  const frontier = Math.max(postTail, reviewTail);
  const entries: MixedEntry[] = [
    ...posts.items.map((item) => ({ kind: 'post' as const, item })),
    ...reviews.items.map((item) => ({ kind: 'review' as const, item })),
  ]
    .filter((e) => time(e.item.created_at) >= frontier)
    .sort((a, b) => time(b.item.created_at) - time(a.item.created_at) || (b.item.id < a.item.id ? -1 : b.item.id > a.item.id ? 1 : 0));
  // No fim da tela: carrega a lista que está segurando a fronteira (ou as duas, se empatarem).
  return {
    entries,
    loadPosts: posts.hasMore && postTail === frontier,
    loadReviews: reviews.hasMore && reviewTail === frontier,
  };
}
