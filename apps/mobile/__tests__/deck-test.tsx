import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DiscoverDeck } from '../src/components/DiscoverDeck';
import i18n from '../src/lib/i18n';
import type { DiscoverCard } from '../src/lib/types';

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock exige require() dentro da fábrica */
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

function makeCard(id: string, title: string): DiscoverCard {
  return {
    link_preview_id: id,
    url: `https://www.deezer.com/track/${id}`,
    platform: 'deezer',
    kind: 'track',
    title,
    artist: null,
    image_url: null,
    genre: null,
    source: 'community',
    note: null,
    post_id: `post-${id}`,
    recommender_username: 'luul',
    recommender_display_name: 'Luul',
    recommender_avatar_url: null,
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => jest.useRealTimers());

describe('<DiscoverDeck />', () => {
  const cards = [makeCard('1', 'Primeira'), makeCard('2', 'Segunda')];

  test('botões "Curti" e "Pular" registram o swipe do cartão do topo', async () => {
    const onSwipe = jest.fn();
    await render(<DiscoverDeck cards={cards} genreName={() => null} onSwipe={onSwipe} />);

    await fireEvent.press(screen.getByTestId('discover-like'));
    await act(async () => {
      jest.runAllTimers();
    });
    expect(onSwipe).toHaveBeenCalledWith(cards[0], true);

    await fireEvent.press(screen.getByTestId('discover-skip'));
    await act(async () => {
      jest.runAllTimers();
    });
    expect(onSwipe).toHaveBeenLastCalledWith(cards[0], false);
  });

  test('mostra o cartão do topo e o próximo atrás', async () => {
    await render(<DiscoverDeck cards={cards} genreName={() => null} onSwipe={jest.fn()} />);
    expect(screen.getByText('Primeira')).toBeTruthy();
    expect(screen.getByText('Segunda')).toBeTruthy();
  });

  test('sem cartões não renderiza nada', async () => {
    await render(<DiscoverDeck cards={[]} genreName={() => null} onSwipe={jest.fn()} />);
    expect(screen.queryByTestId('discover-like')).toBeNull();
  });
});
