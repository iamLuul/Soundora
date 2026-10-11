import { fireEvent, render, screen } from '@testing-library/react-native';
import { RepliesToggle } from '../src/components/CommentItem';
import { buildCommentRows } from '../src/lib/comment-thread';
import i18n from '../src/lib/i18n';
import type { CommentRow } from '../src/lib/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const c = (id: string, parent_id: string | null = null): CommentRow => ({
  id,
  parent_id,
  body: id,
  created_at: '2026-10-11T12:00:00Z',
  like_count: 0,
  reply_count: 0,
  liked_by_me: false,
  author_id: 'a',
  author_username: 'bia',
  author_display_name: 'Bia',
  author_avatar_url: null,
});

const shape = (rows: ReturnType<typeof buildCommentRows>) =>
  rows.map((r) => (r.kind === 'toggle' ? `toggle:${r.hidden}:${r.expanded ? 'open' : 'closed'}` : `${r.item.id}${r.continues ? '|' : ''}`));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('conversa de respostas', () => {
  const big = [c('a'), c('a1', 'a'), c('a2', 'a'), c('a3', 'a'), c('a4', 'a'), c('a5', 'a'), c('b'), c('b1', 'b')];

  test('conversa grande começa recolhida: 2 respostas e "ver mais"', () => {
    expect(shape(buildCommentRows(big, new Set()))).toEqual(['a|', 'a1|', 'a2|', 'toggle:3:closed', 'b|', 'b1']);
  });

  test('aberta mostra todas e termina com "mostrar menos"', () => {
    expect(shape(buildCommentRows(big, new Set(['a'])))).toEqual(['a|', 'a1|', 'a2|', 'a3|', 'a4|', 'a5|', 'toggle:0:open', 'b|', 'b1']);
  });

  test('até 3 respostas não recolhe; sem respostas, sem linha', () => {
    const small = [c('x'), c('x1', 'x'), c('x2', 'x'), c('x3', 'x'), c('y')];
    expect(shape(buildCommentRows(small, new Set()))).toEqual(['x|', 'x1|', 'x2|', 'x3', 'y']);
  });

  test('botão mostra quantas faltam e alterna', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<RepliesToggle rootId="a" hidden={3} expanded={false} onPress={onPress} />);
    expect(screen.getByText('Ver mais 3 respostas')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('replies-toggle-a'));
    expect(onPress).toHaveBeenCalled();
    await rerender(<RepliesToggle rootId="a" hidden={0} expanded onPress={onPress} />);
    expect(screen.getByText('Mostrar menos')).toBeTruthy();
  });
});
