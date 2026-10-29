import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ConversationScreen from '../src/app/messages/[id]';
import ComposeMessageScreen from '../src/app/messages/compose';
import MessagesScreen from '../src/app/messages/index';
import type { DmMessage, DmThread } from '../src/lib/api';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: Record<string, string> = {};
const mockInbox = jest.fn();
const mockMessages = jest.fn();
const mockConversation = jest.fn();
const mockSend = jest.fn(async (..._a: unknown[]) => ({ conversation_id: 'c-new', message_id: 9 }));
const mockAccept = jest.fn(async (_id: string) => undefined);
const mockMarkRead = jest.fn(async (_id: string) => undefined);
const mockLike = jest.fn(async (..._a: unknown[]) => undefined);
const mockUnsend = jest.fn(async (_id: number) => undefined);
const mockFind = jest.fn(async (_id: string): Promise<string | null> => null);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  usePreventRemove: () => () => undefined,
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => true, back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(cb, [cb]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }) }));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchDmInbox: (...a: unknown[]) => mockInbox(...a),
  fetchDmUnread: async () => ({ unread: 1, requests: 2 }),
  fetchDmMessages: (...a: unknown[]) => mockMessages(...a),
  fetchDmConversation: (...a: unknown[]) => mockConversation(...a),
  sendDm: (...a: unknown[]) => mockSend(...a),
  acceptDm: (id: string) => mockAccept(id),
  markDmRead: (id: string) => mockMarkRead(id),
  likeDm: (...a: unknown[]) => mockLike(...a),
  unsendDm: (id: number) => mockUnsend(id),
  findDm: (id: string) => mockFind(id),
  searchProfiles: async () => [{ id: 'u2', username: 'bia', display_name: 'Bia', avatar_url: null }],
}));

const thread = (over: Partial<DmThread> = {}): DmThread => ({
  conversation_id: 'c1',
  user_id: 'u2',
  username: 'bia',
  display_name: 'Bia',
  avatar_url: null,
  last_body: 'oi!',
  last_from_me: false,
  last_vibe_reply: false,
  last_unsent: false,
  last_at: new Date().toISOString(),
  unread: true,
  ...over,
});
const msg = (id: number, over: Partial<DmMessage> = {}): DmMessage => ({
  id,
  from_me: false,
  body: `msg ${id}`,
  liked: false,
  unsent: false,
  created_at: new Date(Date.now() - (100 - id) * 1000).toISOString(),
  vibe_reply: false,
  vibe_id: null,
  vibe_kind: null,
  vibe_media_path: null,
  vibe_text: null,
  vibe_style: null,
  vibe_mine: null,
  ...over,
});
const conversation = (over = {}) => ({
  conversation_id: 'c1',
  user_id: 'u2',
  username: 'bia',
  display_name: 'Bia',
  avatar_url: null,
  accepted: true,
  their_last_read_at: null,
  can_send: true,
  ...over,
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  await i18n.changeLanguage('pt-BR');
});

describe('Mensagens: lista', () => {
  test('conversas com prévia e não lida; aba de Pedidos com o número; abrir a conversa', async () => {
    mockInbox.mockImplementation(async (requests: boolean) =>
      requests
        ? [thread({ conversation_id: 'c9', username: 'caio', display_name: 'Caio' })]
        : [
            thread(),
            thread({
              conversation_id: 'c2',
              username: 'ana',
              display_name: 'Ana',
              last_from_me: true,
              last_body: 'tchau',
              unread: false,
              last_vibe_reply: true,
            }),
          ],
    );
    await wrap(<MessagesScreen />);
    expect(await screen.findByText('oi!')).toBeTruthy();
    expect(screen.getByTestId('thread-unread-bia')).toBeTruthy();
    expect(screen.getByText('Você respondeu à vibe: tchau')).toBeTruthy();
    expect(await screen.findByText('Pedidos (2)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('thread-bia'));
    expect(mockPush).toHaveBeenCalledWith('/messages/c1');
    await fireEvent.press(screen.getByTestId('tab-requests'));
    expect(await screen.findByText('Caio')).toBeTruthy();
    expect(mockInbox).toHaveBeenCalledWith(true, null);
  });
});

describe('Mensagens: conversa', () => {
  test('mostra as mensagens, marca como lida, "Visto" e manda uma nova', async () => {
    Object.assign(mockParams, { id: 'c1' });
    const seenAt = new Date().toISOString();
    mockConversation.mockResolvedValue(conversation({ their_last_read_at: seenAt }));
    mockMessages.mockResolvedValue([msg(3, { from_me: true, body: 'tudo sim' }), msg(2, { unsent: true, body: null }), msg(1, { body: 'tudo bem?' })]);
    await wrap(<ConversationScreen />);
    expect(await screen.findByText('tudo bem?')).toBeTruthy();
    expect(screen.getByText('Mensagem desfeita')).toBeTruthy();
    expect(screen.getByTestId('message-seen')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('message-input'), '  bora ouvir  ');
    await fireEvent.press(screen.getByTestId('message-send'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('bora ouvir', { conversation: 'c1' }));
  });

  test('marca como lida quando a última é da outra pessoa', async () => {
    Object.assign(mockParams, { id: 'c1' });
    mockConversation.mockResolvedValue(conversation());
    mockMessages.mockResolvedValue([msg(1)]);
    await wrap(<ConversationScreen />);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('c1'));
  });

  test('pedido: não marca como lida nem deixa escrever até aceitar', async () => {
    Object.assign(mockParams, { id: 'c1' });
    mockConversation.mockResolvedValue(conversation({ accepted: false }));
    mockMessages.mockResolvedValue([msg(1, { body: 'oi, posso falar?' })]);
    await wrap(<ConversationScreen />);
    expect(await screen.findByTestId('request-bar')).toBeTruthy();
    expect(screen.queryByTestId('message-input')).toBeNull();
    expect(mockMarkRead).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('request-accept'));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith('c1'));
  });

  test('resposta de vibe: a miniatura abre a vibe; vibe que venceu vira aviso', async () => {
    Object.assign(mockParams, { id: 'c1' });
    mockConversation.mockResolvedValue(conversation());
    mockMessages.mockResolvedValue([
      msg(2, { vibe_reply: true, body: 'amei', vibe_id: 'v1', vibe_kind: 'text', vibe_text: 'bom dia', vibe_style: 'pink', vibe_mine: true }),
      msg(1, { vibe_reply: true, body: 'que lugar', from_me: true }),
    ]);
    await wrap(<ConversationScreen />);
    expect(await screen.findByText('Respondeu à sua vibe')).toBeTruthy();
    expect(screen.getByText('A vibe não está mais no ar')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vibe-reply-2'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/vibes/[author]', params: { author: 'me' } });
  });

  test('segurar a mensagem: curtir a recebida; desfazer a minha', async () => {
    Object.assign(mockParams, { id: 'c1' });
    mockConversation.mockResolvedValue(conversation());
    mockMessages.mockResolvedValue([msg(2, { from_me: true, body: 'minha' }), msg(1, { body: 'dela' })]);
    await wrap(<ConversationScreen />);
    await fireEvent(await screen.findByTestId('message-1'), 'longPress');
    await fireEvent.press(screen.getByTestId('option-like'));
    await waitFor(() => expect(mockLike).toHaveBeenCalledWith(1, true));
    await fireEvent(screen.getByTestId('message-2'), 'longPress');
    expect(screen.queryByTestId('option-like')).toBeNull();
    await fireEvent.press(screen.getByTestId('option-unsend'));
    await waitFor(() => expect(mockUnsend).toHaveBeenCalledWith(2));
  });

  test('conversa nova (do perfil): a primeira mensagem cria e troca para a conversa', async () => {
    Object.assign(mockParams, { id: 'draft', to: 'u2', username: 'bia', name: 'Bia' });
    await wrap(<ConversationScreen />);
    expect(screen.getByTestId('conversation-intro')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('message-input'), 'oi bia');
    await fireEvent.press(screen.getByTestId('message-send'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('oi bia', { to: 'u2' }));
    expect(mockReplace).toHaveBeenCalledWith('/messages/c-new');
    expect(mockConversation).not.toHaveBeenCalled();
  });

  test('conversa que não existe (ou de outra pessoa): 404', async () => {
    Object.assign(mockParams, { id: 'c404' });
    mockConversation.mockResolvedValue(null);
    mockMessages.mockResolvedValue([]);
    await wrap(<ConversationScreen />);
    expect(await screen.findByText('Página não encontrada')).toBeTruthy();
  });
});

describe('Nova mensagem', () => {
  test('busca a pessoa e abre a conversa (nova ou a que já existe)', async () => {
    await wrap(<ComposeMessageScreen />);
    await fireEvent.changeText(screen.getByTestId('message-search'), 'bia');
    await fireEvent.press(await screen.findByTestId('message-to-bia'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/messages/[id]', params: { id: 'draft', to: 'u2', username: 'bia', name: 'Bia', avatar: '' } }),
    );
    mockFind.mockResolvedValueOnce('c7');
    await fireEvent.press(screen.getByTestId('message-to-bia'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/messages/c7'));
  });
});
