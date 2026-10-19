import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NewVibeScreen from '../src/app/vibes/new';
import VibeViewerScreen from '../src/app/vibes/[author]';
import { FollowingRow } from '../src/components/FollowingRow';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCreate = jest.fn(async () => 'v1');
const mockPreviewLink = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), canGoBack: () => true, replace: (...a: unknown[]) => mockReplace(...a) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: () => ({ isPlaying: false }) }));
jest.mock('expo-image-picker', () => ({ VideoExportPreset: { H264_1280x720: 0 } }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  createVibe: (...a: unknown[]) => mockCreate(...(a as [])),
  previewLink: (...a: unknown[]) => mockPreviewLink(...a),
  fetchVibesTray: async () => [
    { author_id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null, vibe_count: 1, unseen: false, latest_at: '', is_me: true },
    { author_id: 'b', username: 'bia', display_name: 'Bia', avatar_url: null, vibe_count: 2, unseen: true, latest_at: '', is_me: false },
    { author_id: 'c', username: 'caio', display_name: 'Caio', avatar_url: null, vibe_count: 1, unseen: true, latest_at: '', is_me: false },
  ],
  fetchVibesOf: async (author: string) => mockVibesOf[author] ?? [],
  markVibeSeen: async () => undefined,
  fetchUnreadNotifications: async () => 0,
}));

function textVibe(id: string, text: string, seen = false) {
  return {
    id, kind: 'text', media_path: null, duration_ms: null, text, style: 'violet', created_at: new Date().toISOString(), seen, view_count: null,
    preview_url: null, preview_platform: null, preview_title: null, preview_artist: null, preview_image_url: null, post_id: null, post_body: null,
    post_author_username: null, post_author_avatar_url: null, text_x: null, text_y: null, preview_audio_url: null, text_items: null,
  };
}
const mockVibesOf: Record<string, ReturnType<typeof textVibe>[]> = {
  b: [textVibe('b1', 'oi da bia'), textVibe('b2', 'tchau da bia')],
  c: [textVibe('c1', 'oi do caio')],
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  await i18n.changeLanguage('pt-BR');
});

describe('Nova vibe', () => {
  test('texto com cor de fundo', async () => {
    await wrap(<NewVibeScreen />);
    expect(screen.getByTestId('vibe-publish').props.accessibilityState.disabled).toBe(true);
    // Não existe mais a caixa de texto embaixo: toca na vibe para escrever ali.
    expect(screen.queryByTestId('vibe-text')).toBeNull();
    const card = screen.getByTestId('vibe-canvas');
    await fireEvent.press(card, { nativeEvent: { locationX: 40, locationY: 60 } });
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'bom dia');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    expect(screen.getByText('bom dia')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vibe-style-pink'));
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        kind: 'text',
        style: 'pink',
        textItems: [{ t: 'bom dia', x: expect.any(Number), y: expect.any(Number), f: 'classic', c: 'white', b: 'none' }],
      }),
    );
  });

  test('vários textos: tocar em outro lugar cria outro; só editam ao tocar neles; fonte, cor e fundo por texto', async () => {
    await wrap(<NewVibeScreen />);
    const canvas = () => screen.getByTestId('vibe-canvas');
    // Primeiro texto.
    await fireEvent.press(canvas(), { nativeEvent: { locationX: 40, locationY: 60 } });
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'primeiro');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    // Tocar em outro lugar: um texto NOVO (vazio), sem puxar o que já foi escrito.
    await fireEvent.press(canvas(), { nativeEvent: { locationX: 300, locationY: 500 } });
    expect(screen.getByTestId('vibe-text').props.value).toBe('');
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'segundo');
    // Estilo só deste texto: fonte com serifa, amarelo, fundo (sem → cheio).
    await fireEvent.press(screen.getByTestId('vibe-font-serif'));
    await fireEvent.press(screen.getByTestId('vibe-color-yellow'));
    await fireEvent.press(screen.getByTestId('vibe-text-bg'));
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    expect(screen.getByText('primeiro')).toBeTruthy();
    expect(screen.getByText('segundo')).toBeTruthy();
    // O próximo texto já nasce com o último estilo usado.
    await fireEvent.press(canvas(), { nativeEvent: { locationX: 200, locationY: 300 } });
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'terceiro');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    // Tocar no primeiro texto edita ele (com o texto dele), não cria outro.
    await fireEvent(screen.getByTestId('vibe-text-item-0'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(screen.getByTestId('vibe-text').props.value).toBe('primeiro');
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'primeiro!');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    // Texto apagado some ao terminar.
    await fireEvent.press(canvas(), { nativeEvent: { locationX: 100, locationY: 100 } });
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    expect(screen.queryByTestId('vibe-text-item-3')).toBeNull();

    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const sent = (mockCreate.mock.calls[0] as unknown as [{ textItems: { t: string; x: number; y: number; f: string; c: string; b: string }[] }])[0].textItems;
    expect(sent.map((i) => [i.t, i.f, i.c, i.b])).toEqual([
      ['primeiro!', 'classic', 'white', 'none'],
      ['segundo', 'serif', 'yellow', 'solid'],
      ['terceiro', 'serif', 'yellow', 'solid'],
    ]);
    // Cada um no seu lugar.
    expect(new Set(sent.map((i) => `${i.x.toFixed(2)},${i.y.toFixed(2)}`)).size).toBe(3);
  });

  test('apagar o texto pela lixeira; no máximo 8 textos', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-canvas'), { nativeEvent: { locationX: 40, locationY: 60 } });
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'some');
    await fireEvent.press(screen.getByTestId('vibe-text-delete'));
    expect(screen.queryByText('some')).toBeNull();
    expect(screen.getByTestId('vibe-publish').props.accessibilityState.disabled).toBe(true);

    for (let i = 0; i < 8; i++) {
      await fireEvent.press(screen.getByTestId('vibe-canvas'), { nativeEvent: { locationX: 20 + i * 30, locationY: 40 + i * 50 } });
      await fireEvent.changeText(screen.getByTestId('vibe-text'), `t${i}`);
      await fireEvent.press(screen.getByTestId('vibe-text-done'));
    }
    await fireEvent.press(screen.getByTestId('vibe-canvas'), { nativeEvent: { locationX: 200, locationY: 400 } });
    expect(screen.queryByTestId('vibe-text')).toBeNull();
    expect(screen.getByText('No máximo 8 textos por vibe.')).toBeTruthy();
  });

  test('vibe antiga (um texto só, sem lista) continua aparecendo', async () => {
    mockVibesOf.old = [{ ...textVibe('o1', 'texto antigo'), text_x: 0.5, text_y: 0.5 } as never];
    Object.assign(mockParams, { author: 'old' });
    await wrap(<VibeViewerScreen />);
    await waitFor(() => expect(screen.getByText('texto antigo')).toBeTruthy());
  });

  test('vibe com vários textos mostra todos', async () => {
    mockVibesOf.multi = [{ ...textVibe('m1', 'a\nb'), text_items: [{ t: 'a', x: 0.2, y: 0.2, f: 'serif', c: 'yellow', b: 'solid' }, { t: 'b', x: 0.8, y: 0.8, f: 'strong', c: 'white', b: 'soft' }] } as never];
    Object.assign(mockParams, { author: 'multi' });
    await wrap(<VibeViewerScreen />);
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy());
    expect(screen.getByText('b')).toBeTruthy();
  });

  test('compartilhar um post: abre já com o post e publica como vibe de post', async () => {
    Object.assign(mockParams, { postId: 'p1', postUser: 'bia', postBody: 'ouçam', postUrl: 'https://open.spotify.com/track/x', postPlatform: 'spotify', postTitle: 'Faixa' });
    await wrap(<NewVibeScreen />);
    expect(screen.getByText('@bia')).toBeTruthy();
    expect(screen.queryByTestId('vibe-mode-text')).toBeNull();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'post', postId: 'p1', style: 'violet', textItems: [] }));
  });
});

describe('Fila de Vibes na Home', () => {
  test('eu primeiro e depois só quem tem vibe; abrir leva a fila', async () => {
    await wrap(<FollowingRow />);
    await waitFor(() => expect(screen.getByTestId('vibe-bia')).toBeTruthy());
    expect(screen.getByTestId('vibe-caio')).toBeTruthy();
    // Quem eu sigo e não postou vibe não aparece (antes aparecia e abria o perfil).
    expect(screen.queryByLabelText('@dani')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('vibe-bia'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/vibes/[author]', params: { author: 'b', queue: 'c' } });
    await fireEvent.press(screen.getByTestId('vibe-new'));
    expect(mockPush).toHaveBeenCalledWith('/vibes/new');
  });
});

describe('Ver vibes em sequência', () => {
  test('acabou uma pessoa, a próxima entra na mesma tela (sem fechar e abrir)', async () => {
    Object.assign(mockParams, { author: 'b', queue: 'c' });
    await wrap(<VibeViewerScreen />);
    await waitFor(() => expect(screen.getByText('oi da bia')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('vibe-next'));
    expect(screen.getByText('tchau da bia')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vibe-next'));
    await waitFor(() => expect(screen.getByText('oi do caio')).toBeTruthy());
    expect(screen.getByText('@caio')).toBeTruthy();
    // Nada de navegar: a tela continuou aberta.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();

    // Voltar na primeira vibe do Caio leva de volta à Bia.
    await fireEvent.press(screen.getByTestId('vibe-prev'));
    await waitFor(() => expect(screen.getByText('@bia')).toBeTruthy());

    // No fim da fila, fecha.
    await fireEvent.press(screen.getByTestId('vibe-next'));
    await fireEvent.press(screen.getByTestId('vibe-next'));
    await waitFor(() => expect(screen.getByText('oi do caio')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('vibe-next'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('Vibe de música', () => {
  test('o link é colado na própria vibe e gera o card (sem prévia de áudio); tocar no card abre o link de novo', async () => {
    // Mesmo que venha uma prévia antiga do servidor, a vibe não toca áudio (licenças das lojas).
    mockPreviewLink.mockResolvedValue({ id: 'lp1', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', platform: 'spotify', kind: 'track', title: 'Midnight City', artist: 'M83', image_url: null, audio_url: 'https://audio-ssl.itunes.apple.com/p.m4a' });
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-music'));
    // Campo do link já aberto na vibe; nada de caixa embaixo.
    await fireEvent.changeText(screen.getByTestId('vibe-link'), 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    await waitFor(() => expect(mockPreviewLink).toHaveBeenCalledWith('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'));
    await waitFor(() => expect(screen.getByText('Midnight City')).toBeTruthy());
    expect(screen.queryByTestId('vibe-link')).toBeNull();
    expect(screen.queryByTestId('vibe-mute')).toBeNull();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'music', linkPreviewId: 'lp1', style: 'violet', textItems: [] }));
  });
});
