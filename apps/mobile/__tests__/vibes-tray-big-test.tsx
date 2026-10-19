import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FollowingRow } from '../src/components/FollowingRow';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));
const person = (n: number) => ({ author_id: `id-${n}`, username: `pessoa${n}`, display_name: `Pessoa ${n}`, avatar_url: null, vibe_count: 1, unseen: true, latest_at: '', is_me: false });
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchVibesTray: async () => Array.from({ length: 100 }, (_, i) => person(i)),
  fetchUnreadNotifications: async () => 0,
}));

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

test('fila com 100 pessoas monta só as primeiras (lista virtualizada) e leva no máximo 30 na fila', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <FollowingRow />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('vibe-pessoa0')).toBeTruthy());
  expect(screen.queryByTestId('vibe-pessoa99')).toBeNull();
  expect(screen.queryAllByTestId(/^vibe-pessoa/).length).toBeLessThan(40);

  await fireEvent.press(screen.getByTestId('vibe-pessoa0'));
  const { params } = mockPush.mock.calls[0]![0] as { params: { author: string; queue: string } };
  expect(params.author).toBe('id-0');
  const queue = params.queue.split(',');
  expect(queue).toHaveLength(30);
  expect(queue[0]).toBe('id-1');
});
