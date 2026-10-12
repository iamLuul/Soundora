import { act, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList, Text } from 'react-native';
import { PullToRefresh } from '../src/components/PullToRefresh';
import { Spinner } from '../src/components/Spinner';
import i18n from '../src/lib/i18n';
import { keysToRefresh, parseLiveNotification } from '../src/lib/live';

jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));

const me = { id: 'u1', username: 'raul' };
const POST = '11111111-2222-4333-8444-555555555555';

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('notificações ao vivo', () => {
  test('aceita só avisos no formato do banco', () => {
    expect(parseLiveNotification({ kind: 'like', post_id: POST, removed: false })).toEqual({ kind: 'like', post_id: POST, removed: false });
    expect(parseLiveNotification({ kind: 'follow', post_id: null })).toEqual({ kind: 'follow', post_id: null, removed: false });
    expect(parseLiveNotification({ kind: 'hack', post_id: POST })).toBeNull();
    expect(parseLiveNotification(null)).toBeNull();
    expect(parseLiveNotification('like')).toBeNull();
    // post_id estranho é ignorado (não vira chave de consulta).
    expect(parseLiveNotification({ kind: 'comment', post_id: '../x' })).toEqual({ kind: 'comment', post_id: null, removed: false });
  });

  test('atualiza o sino, a lista e só o que o aviso afeta', () => {
    const like = keysToRefresh([{ kind: 'like', post_id: POST }], me);
    expect(like).toEqual([['notifications-unread'], ['notifications'], ['post', POST]]);

    const reply = keysToRefresh([{ kind: 'reply', post_id: POST }], me);
    expect(reply).toContainEqual(['comments', POST]);

    const follow = keysToRefresh([{ kind: 'follow', post_id: null }], me);
    expect(follow).toContainEqual(['profile', 'raul']);
    expect(follow).toContainEqual(['people', 'raul']);

    // Várias curtidas juntas no mesmo post: uma atualização só.
    expect(keysToRefresh([{ kind: 'like', post_id: POST }, { kind: 'like', post_id: POST }], me)).toHaveLength(3);
  });
});

describe('spinner e puxar para atualizar', () => {
  test('spinner é um indicador de carregamento acessível', async () => {
    await render(<Spinner />);
    expect(screen.getByRole('progressbar', { name: 'Carregando…' })).toBeTruthy();
  });

  test('o spinner do sistema fica escondido e o anel do app aparece até a busca terminar', async () => {
    let finish: () => void = () => undefined;
    const onRefresh = jest.fn(() => new Promise<void>((r) => (finish = r)));
    await render(
      <PullToRefresh onRefresh={onRefresh}>
        <FlatList testID="lista" data={[1]} renderItem={() => <Text>item</Text>} />
      </PullToRefresh>,
    );
    // O RefreshControl vai para a lista (no Jest, a ScrollView não o desenha).
    const control = () => screen.getByTestId('lista').props.refreshControl;
    expect(control().props.tintColor).toBe('transparent');
    expect(screen.queryByTestId('spinner')).toBeTruthy(); // anel parado, invisível até puxar

    await act(async () => {
      void control().props.onRefresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(control().props.refreshing).toBe(true);
    // Puxar de novo durante a busca não dispara outra.
    await act(async () => {
      void control().props.onRefresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(control().props.refreshing).toBe(false), { timeout: 2000 });
  });
});
