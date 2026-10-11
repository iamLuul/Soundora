import { fireEvent, render, screen } from '@testing-library/react-native';
import { DiscoverCardView } from '../src/components/DiscoverCardView';
import { SearchResults } from '../src/components/SearchPanel';
import { TrendingRow } from '../src/components/TrendingList';
import i18n from '../src/lib/i18n';
import { genreLabel } from '../src/lib/queries';
import type { DiscoverCard, Profile, TrackResult, TrendingTrack } from '../src/lib/types';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const card: DiscoverCard = {
  link_preview_id: 'lp1',
  url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  platform: 'spotify',
  kind: 'track',
  title: 'Sometimes',
  artist: 'My Bloody Valentine',
  image_url: null,
  genre: 'shoegaze',
  source: 'community',
  note: null,
  post_id: 'p1',
  recommender_username: 'luul',
  recommender_display_name: 'Luul',
  recommender_avatar_url: null,
};

const track: TrendingTrack = {
  rank: 1,
  link_preview_id: 'lp2',
  url: 'https://www.deezer.com/track/3135556',
  platform: 'deezer',
  kind: 'track',
  title: 'Harder, Better, Faster, Stronger',
  artist: 'Daft Punk',
  image_url: null,
  post_count: 3,
  like_count: 10,
  score: 19,
};

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('<DiscoverCardView />', () => {
  test('música da comunidade mostra quem indicou e o gênero', async () => {
    await render(<DiscoverCardView card={card} genreName="Shoegaze" />);
    expect(screen.getByText('Sometimes')).toBeTruthy();
    expect(screen.getByText('Indicada por @luul')).toBeTruthy();
    expect(screen.getByText('Shoegaze')).toBeTruthy();
  });

  test('destaque mostra o selo e a nota da curadoria', async () => {
    await render(<DiscoverCardView card={{ ...card, source: 'featured', note: 'clássico do gênero', recommender_username: null }} genreName={null} />);
    expect(screen.getByText('Destaque do Soundora')).toBeTruthy();
    expect(screen.getByText('“clássico do gênero”')).toBeTruthy();
    expect(screen.queryByText(/Indicada por/)).toBeNull();
  });

  test('o botão abre o streaming de origem', async () => {
    const onOpen = jest.fn();
    await render(<DiscoverCardView card={card} genreName={null} onOpen={onOpen} />);
    await fireEvent.press(screen.getAllByRole('link', { name: 'Ouvir no Spotify' })[0]!);
    expect(onOpen).toHaveBeenCalledWith(card);
  });
});

describe('<TrendingRow />', () => {
  test('mostra posição, artista e posts no plural certo', async () => {
    await render(<TrendingRow item={track} onOpen={jest.fn()} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Daft Punk · 3 posts')).toBeTruthy();
  });

  test('singular em inglês e abre o link ao tocar', async () => {
    await i18n.changeLanguage('en');
    const onOpen = jest.fn();
    await render(<TrendingRow item={{ ...track, post_count: 1 }} onOpen={onOpen} />);
    expect(screen.getByText('Daft Punk · 1 post')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trending-1'));
    expect(onOpen).toHaveBeenCalledWith(track.url);
  });
});

describe('<SearchResults />', () => {
  const person: Profile = {
    id: 'u1',
    username: 'clairey',
    display_name: 'Clairey',
    bio: null,
    avatar_url: null,
    banner_url: null,
    username_changed_at: null,
    locale: 'pt-BR',
    created_at: '2026-10-01T00:00:00Z',
  };
  const song: TrackResult = { ...track, post_count: 2 };

  test('pede pelo menos 2 letras', async () => {
    await render(<SearchResults query="a" people={[]} tracks={[]} loading={false} onOpenProfile={jest.fn()} />);
    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeTruthy();
  });

  test('avisa quando não acha nada', async () => {
    await render(<SearchResults query="xyz" people={[]} tracks={[]} loading={false} onOpenProfile={jest.fn()} />);
    expect(screen.getByText('Nada encontrado para “xyz”.')).toBeTruthy();
  });

  test('lista pessoas e músicas; tocar na pessoa abre o perfil', async () => {
    const onOpenProfile = jest.fn();
    await render(<SearchResults query="cla" people={[person]} tracks={[song]} loading={false} onOpenProfile={onOpenProfile} />);
    expect(screen.getByText('Pessoas')).toBeTruthy();
    expect(screen.getByText('Músicas')).toBeTruthy();
    expect(screen.getByText('Harder, Better, Faster, Stronger')).toBeTruthy();
    await fireEvent.press(screen.getByText('Clairey'));
    expect(onOpenProfile).toHaveBeenCalledWith('clairey');
  });

  test('quem eu bloqueei aparece marcado, não abre o perfil e tem o botão de desbloquear', async () => {
    const onOpenProfile = jest.fn();
    const onUnblock = jest.fn();
    const blocked = { ...person, blocked_by_me: true };
    await render(<SearchResults query="cla" people={[blocked]} tracks={[]} loading={false} onOpenProfile={onOpenProfile} onUnblock={onUnblock} />);
    expect(screen.getByText('Bloqueado')).toBeTruthy();
    await fireEvent.press(screen.getByText('Clairey'));
    expect(onOpenProfile).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('unblock-clairey'));
    expect(onUnblock).toHaveBeenCalledWith(blocked);
  });
});

describe('genreLabel', () => {
  const genres = [{ slug: 'funk_br', name_pt: 'Funk', name_en: 'Brazilian funk' }];
  test('usa o nome no idioma da pessoa', () => {
    expect(genreLabel(genres, 'funk_br', 'pt-BR')).toBe('Funk');
    expect(genreLabel(genres, 'funk_br', 'en')).toBe('Brazilian funk');
  });
  test('cai para o slug legível quando não conhece o gênero', () => {
    expect(genreLabel(genres, 'lo_fi', 'pt-BR')).toBe('Lo Fi');
    expect(genreLabel(genres, null, 'pt-BR')).toBeNull();
  });
});
