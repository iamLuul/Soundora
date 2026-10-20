// Anel roxo da foto nos posts: só para quem tem vibe ativa; uma consulta só para a página toda.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react-native';
import { PostCard } from '../src/components/PostCard';
import i18n from '../src/lib/i18n';
import type { FeedItem } from '../src/lib/types';

jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => children, router: { push: jest.fn() } }));
const mockActive = jest.fn(async (_ids: string[]) => new Set(['com-vibe']));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchAuthorsWithVibes: (ids: string[]) => mockActive(ids),
}));

function post(id: string, author: string): FeedItem {
  return {
    id,
    body: `post ${id}`,
    genre: null,
    like_count: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
    liked_by_me: false,
    author_id: author,
    author_username: author,
    author_display_name: author,
    author_avatar_url: null,
    preview_url: null,
    preview_platform: null,
    preview_kind: null,
    preview_title: null,
    preview_artist: null,
    preview_image_url: null,
    score: 1,
    genres: [],
    media: [],
    post_type: 'text',
  } as unknown as FeedItem;
}

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

test('anel só em quem tem vibe ativa, e os posts da tela viram uma consulta só', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <PostCard item={post('p1', 'com-vibe')} onToggleLike={jest.fn()} />
      <PostCard item={post('p2', 'sem-vibe')} onToggleLike={jest.fn()} />
      <PostCard item={post('p3', 'com-vibe')} onToggleLike={jest.fn()} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(within(screen.getByTestId('post-p1')).getByTestId('avatar-ring')).toBeTruthy());
  expect(within(screen.getByTestId('post-p3')).getByTestId('avatar-ring')).toBeTruthy();
  expect(within(screen.getByTestId('post-p2')).queryByTestId('avatar-ring')).toBeNull();
  expect(mockActive).toHaveBeenCalledTimes(1);
  expect(mockActive.mock.calls[0]![0].sort()).toEqual(['com-vibe', 'sem-vibe']);
});

test('sem resposta do banco (erro), nenhum anel', async () => {
  mockActive.mockRejectedValueOnce(new Error('offline'));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={qc}>
      <PostCard item={post('p9', 'com-vibe')} onToggleLike={jest.fn()} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockActive).toHaveBeenCalledTimes(2));
  expect(screen.queryByTestId('avatar-ring')).toBeNull();
});
