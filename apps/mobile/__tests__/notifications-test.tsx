import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NotificationsScreen from '../src/app/notifications';
import type { NotificationItem } from '../src/lib/api';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
const mockFetch = jest.fn();
const mockMarkRead = jest.fn(async () => undefined);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...a: unknown[]) => mockPush(...a), canGoBack: () => true, back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/push', () => ({ pushAvailability: () => ({ ok: false, reason: 'web' }), pushEnabled: () => false, enablePush: jest.fn() }));
jest.mock('../src/lib/api', () => ({
  fetchNotifications: (...a: unknown[]) => mockFetch(...a),
  fetchUnreadNotifications: async () => 0,
  markNotificationsRead: () => mockMarkRead(),
}));

const base: Omit<NotificationItem, 'id' | 'kind'> = {
  created_at: new Date().toISOString(),
  read: false,
  actor_id: 'a1',
  actor_username: 'bia',
  actor_display_name: 'Bia',
  actor_avatar_url: null,
  post_id: 'p1',
  preview_title: 'Faixa',
  preview_image_url: null,
  comment_body: null,
};

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('pt-BR');
});

describe('Notificações', () => {
  test('mostra cada tipo, marca como lidas e abre o post ou o perfil', async () => {
    mockFetch.mockResolvedValue([
      { ...base, id: 3, kind: 'comment', comment_body: 'que som!' },
      { ...base, id: 2, kind: 'like' },
      { ...base, id: 1, kind: 'follow', post_id: null, actor_username: 'caio' },
    ]);
    await renderScreen();
    await waitFor(() => expect(screen.getByLabelText('@bia comentou no seu post: que som!')).toBeTruthy());
    expect(screen.getByLabelText('@bia curtiu seu post')).toBeTruthy();
    expect(screen.getByLabelText('@caio começou a seguir você')).toBeTruthy();
    expect(mockMarkRead).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('notification-2'));
    expect(mockPush).toHaveBeenCalledWith('/post/p1');
    await fireEvent.press(screen.getByTestId('notification-1'));
    expect(mockPush).toHaveBeenCalledWith('/u/caio');
  });

  test('aba Respostas pede só comentários; vazio mostra a mensagem', async () => {
    mockFetch.mockResolvedValue([]);
    await renderScreen();
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('all', null));
    await fireEvent.press(screen.getByTestId('tab-replies'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('replies', null));
    expect(await screen.findByText('Nenhum comentário ainda.')).toBeTruthy();
  });
});
