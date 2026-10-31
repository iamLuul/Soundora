// Comentário: nome, @ e @marcado abrem o perfil; o "…" compartilha e denuncia.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CommentActions } from '../src/components/CommentActions';
import { CommentItem } from '../src/components/CommentItem';
import i18n from '../src/lib/i18n';
import type { CommentRow } from '../src/lib/types';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const comment: CommentRow = {
  id: 'c1',
  parent_id: 'c0',
  body: '@Teste_1 concordo',
  created_at: '2026-10-31T12:00:00Z',
  like_count: 0,
  reply_count: 0,
  liked_by_me: false,
  author_id: 'a',
  author_username: 'bia',
  author_display_name: 'Bia',
  author_avatar_url: null,
};

beforeEach(async () => {
  (router.push as jest.Mock).mockClear();
  await i18n.changeLanguage('pt-BR');
});

test('nome, @ do autor e @ marcado levam ao perfil', async () => {
  await render(<CommentItem item={comment} onToggleLike={jest.fn()} onReply={jest.fn()} />);
  await fireEvent.press(screen.getByTestId('comment-author-c1'));
  await fireEvent.press(screen.getByTestId('comment-handle-c1'));
  await fireEvent.press(screen.getByTestId('mention-teste_1'), { stopPropagation: jest.fn() });
  expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['/u/bia', '/u/bia', '/u/teste_1']);
});

test('todo comentário tem o "…"', async () => {
  const onMore = jest.fn();
  await render(<CommentItem item={comment} onToggleLike={jest.fn()} onReply={jest.fn()} onMore={onMore} />);
  await fireEvent.press(screen.getByLabelText('Opções do comentário'));
  expect(onMore).toHaveBeenCalledWith(comment);
});

test('menu: compartilhar e denunciar com o motivo; no meu comentário, só compartilhar', async () => {
  const onAction = jest.fn();
  const view = await render(<CommentActions visible isMine={false} onClose={jest.fn()} onAction={onAction} />);
  await fireEvent.press(screen.getByText('Compartilhar comentário'));
  expect(onAction).toHaveBeenLastCalledWith({ type: 'share' });
  await fireEvent.press(screen.getByText('Denunciar comentário'));
  await fireEvent.press(screen.getByTestId('comment-report-spam'));
  expect(onAction).toHaveBeenLastCalledWith({ type: 'report', reason: 'spam' });

  await view.rerender(<CommentActions visible isMine onClose={jest.fn()} onAction={onAction} />);
  expect(screen.getByText('Compartilhar comentário')).toBeTruthy();
  expect(screen.queryByText('Denunciar comentário')).toBeNull();
});
