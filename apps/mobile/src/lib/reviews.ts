// Reviews de álbuns: lista (com páginas) e curtir com resposta imediata na tela.
import { type InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type AlbumReview, fetchReviews, REVIEWS_PAGE, type ReviewCursor, setReviewLiked } from './api';

export type ReviewFilter = { author?: string; album?: string };

export const reviewKeys = {
  all: ['reviews'] as const,
  list: (f: ReviewFilter = {}) => ['reviews', f.author ?? '', f.album ?? ''] as const,
};

export function useReviews(filter: ReviewFilter = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: reviewKeys.list(filter),
    enabled,
    queryFn: ({ pageParam }) => fetchReviews(pageParam, filter),
    initialPageParam: null as ReviewCursor | null,
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === REVIEWS_PAGE && tail ? { createdAt: tail.created_at, id: tail.id } : undefined;
    },
  });
}

const toggled = (r: AlbumReview): AlbumReview => ({
  ...r,
  liked_by_me: !r.liked_by_me,
  like_count: Math.max(0, r.like_count + (r.liked_by_me ? -1 : 1)),
});

/** Curtir/descurtir: muda na tela na hora e desfaz se o servidor recusar. */
export function useToggleReviewLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: AlbumReview) => setReviewLiked(r.id, !r.liked_by_me),
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: reviewKeys.all });
      const lists = qc.getQueriesData<InfiniteData<AlbumReview[]>>({ queryKey: reviewKeys.all });
      for (const [key, data] of lists) {
        if (!data) continue;
        qc.setQueryData(key, { ...data, pages: data.pages.map((p) => p.map((x) => (x.id === r.id ? toggled(x) : x))) });
      }
      return { lists };
    },
    onError: (_err, _r, ctx) => {
      for (const [key, data] of ctx?.lists ?? []) qc.setQueryData(key, data);
    },
  });
}

/** Tira uma review de todas as listas (apagada, ou de alguém bloqueado). */
export function removeReviewFromCache(qc: ReturnType<typeof useQueryClient>, id: string) {
  for (const [key, data] of qc.getQueriesData<InfiniteData<AlbumReview[]>>({ queryKey: reviewKeys.all })) {
    if (data) qc.setQueryData(key, { ...data, pages: data.pages.map((p) => p.filter((x) => x.id !== id)) });
  }
}

/** "9.1" ou "9,1" conforme o idioma; inteiro mostra uma casa ("8.0"), como no Figma. */
export function formatRating(rating: number, locale: string): string {
  return rating.toLocaleString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
