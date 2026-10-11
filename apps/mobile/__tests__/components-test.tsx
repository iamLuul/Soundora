import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { MusicCard } from '../src/components/MusicCard';
import { PostCard } from '../src/components/PostCard';
import i18n from '../src/lib/i18n';
import type { FeedItem } from '../src/lib/types';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { push: jest.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, enabled: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const post: FeedItem = {
  id: 'p1',
  body: 'essa me lembra a estrada',
  genre: 'rock',
  like_count: 4,
  comment_count: 2,
  created_at: new Date().toISOString(),
  liked_by_me: false,
  author_id: 'u1',
  author_username: 'luul',
  author_display_name: 'Luul',
  author_avatar_url: null,
  preview_url: 'https://www.deezer.com/track/3135556',
  preview_platform: 'deezer',
  preview_kind: 'track',
  preview_title: 'Harder, Better, Faster, Stronger',
  preview_artist: 'Daft Punk',
  preview_image_url: null,
  score: 1,
  genres: ['rock'],
  media: [],
  post_type: 'music',
};

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('<MusicCard />', () => {
  test('mostra a música e abre o streaming de origem ao tocar', async () => {
    const onOpen = jest.fn();
    await render(
      <MusicCard
        onOpen={onOpen}
        data={{ url: post.preview_url!, platform: 'deezer', title: post.preview_title!, artist: 'Daft Punk', imageUrl: null }}
      />,
    );
    expect(screen.getByText('Harder, Better, Faster, Stronger')).toBeTruthy();
    expect(screen.getByText('Daft Punk')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: /Ouvir no Deezer/ }));
    expect(onOpen).toHaveBeenCalledWith('https://www.deezer.com/track/3135556');
  });

  test('em inglês', async () => {
    await i18n.changeLanguage('en');
    await render(<MusicCard onOpen={jest.fn()} data={{ url: 'https://open.spotify.com/track/x', platform: 'spotify', title: 'T', artist: null, imageUrl: null }} />);
    expect(screen.getByText('Listen on Spotify')).toBeTruthy();
  });
});

describe('<PostCard />', () => {
  test('mostra autor, texto e contadores', async () => {
    await render(<PostCard item={post} onToggleLike={jest.fn()} onOpenLink={jest.fn()} />, { wrapper });
    expect(screen.getByText('Luul')).toBeTruthy();
    expect(screen.getByText('essa me lembra a estrada')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  test('curtir chama a ação com o post', async () => {
    const onToggleLike = jest.fn();
    await render(<PostCard item={post} onToggleLike={onToggleLike} onOpenLink={jest.fn()} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Curtir' }));
    expect(onToggleLike).toHaveBeenCalledWith(post);
  });

  test('menu "…" abre as ações do post', async () => {
    const onMore = jest.fn();
    await render(<PostCard item={post} onToggleLike={jest.fn()} onMore={onMore} onOpenLink={jest.fn()} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Opções do post' }));
    expect(onMore).toHaveBeenCalledWith(post);
  });
});

describe('<PostCard /> sem música', () => {
  test('post só de texto: sem cartão de música; tocar abre o post', async () => {
    const onOpen = jest.fn();
    const textPost: FeedItem = { ...post, preview_url: null, preview_platform: null, preview_kind: null, preview_title: null, preview_artist: null, post_type: 'text', genres: [] };
    await render(<PostCard item={textPost} onToggleLike={jest.fn()} onOpen={onOpen} />, { wrapper });
    expect(screen.queryByRole('link', { name: /Ouvir no/ })).toBeNull();
    await fireEvent.press(screen.getByTestId('post-p1'));
    expect(onOpen).toHaveBeenCalledWith(textPost);
  });
});
