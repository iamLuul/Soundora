import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import NewVibeScreen from '../src/app/vibes/new';
import VibeViewerScreen from '../src/app/vibes/[author]';
import { FollowingRow } from '../src/components/FollowingRow';
import i18n from '../src/lib/i18n';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCreate = jest.fn(async () => 'v1');
const mockPreviewLink = jest.fn();
const mockConvert = jest.fn(async () => new Uint8Array([1]));
const mockSearchSongs = jest.fn(async (_q: string) => [{ id: 'd1', title: 'Midnight City', artist: 'M83', album: null, image_url: null }]);
const mockPickSong = jest.fn(async (_id: string) => ({
  link_preview_id: 'lp1',
  title: 'Midnight City',
  artist: 'M83',
  image_url: null,
  url: 'https://www.deezer.com/track/1',
  platform: 'deezer',
}));
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
jest.mock('../src/lib/image-convert', () => ({ convertVibePhoto: (...a: unknown[]) => mockConvert(...(a as [])) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));
jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  createVibe: (...a: unknown[]) => mockCreate(...(a as [])),
  previewLink: (...a: unknown[]) => mockPreviewLink(...a),
  uploadVibeMedia: async (type: string) => ({ path: type === 'photo' ? 'me/f.jpg' : 'me/v.mp4', durationMs: undefined }),
  searchSongs: (q: string) => mockSearchSongs(q),
  pickSong: (id: string) => mockPickSong(id),
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

describe('Nova vibe: câmera', () => {
  test('abre na câmera: foto com o botão, e a vibe vai para a edição e publica', async () => {
    await wrap(<NewVibeScreen />);
    expect(screen.getByTestId('camera-view')).toBeTruthy();
    expect(screen.getByTestId('vibe-mode-library')).toBeTruthy();
    expect(screen.getByTestId('vibe-mode-text')).toBeTruthy();
    expect(screen.getByTestId('vibe-mode-music')).toBeTruthy();
    expect(screen.getByText('VIBE')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vibe-shutter'));
    await waitFor(() => expect(screen.getByTestId('vibe-canvas')).toBeTruthy());
    expect(mockConvert).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'photo', mediaPath: 'me/f.jpg', durationMs: undefined, linkPreviewId: undefined, textItems: [] }));
    expect(mockConvert).toHaveBeenCalledWith('file:///camera/foto.jpg', 1080, 1920);
    expect(mockBack).toHaveBeenCalled();
  });

  test('sem permissão da câmera: pede, e galeria, texto e música continuam', async () => {
    (globalThis as { __mockCameraPermission?: object }).__mockCameraPermission = { granted: false, canAskAgain: false, status: 'denied' };
    try {
      await wrap(<NewVibeScreen />);
      expect(screen.queryByTestId('camera-view')).toBeNull();
      expect(screen.getByText('Permita o acesso à câmera')).toBeTruthy();
      expect(screen.getByText('Abrir configurações')).toBeTruthy();
      expect(screen.getByTestId('vibe-shutter').props.accessibilityState.disabled).toBe(true);
      expect(screen.getByTestId('vibe-mode-library')).toBeTruthy();
    } finally {
      delete (globalThis as { __mockCameraPermission?: object }).__mockCameraPermission;
    }
  });

  test('descartar volta para a câmera (pergunta se já tem algo)', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-text'));
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'oi');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    await fireEvent.press(screen.getByTestId('vibe-discard'));
    expect(Alert.alert).toHaveBeenCalled();
    expect(screen.getByTestId('camera-view')).toBeTruthy();
    jest.restoreAllMocks();
  });
});

describe('Nova vibe: textos', () => {
  test('Aa abre o texto no fundo colorido: fonte, cor, fundo do texto e alinhamento; troca a cor do fundo', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-text'));
    // Sem texto não publica.
    expect(screen.getByTestId('vibe-publish').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'bom dia');
    await fireEvent.press(screen.getByTestId('vibe-font-serif'));
    await fireEvent.press(screen.getByTestId('vibe-tool-color'));
    await fireEvent.press(screen.getByTestId('vibe-color-yellow'));
    await fireEvent.press(screen.getByTestId('vibe-text-bg'));
    await fireEvent.press(screen.getByTestId('vibe-text-align'));
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    expect(screen.getByText('bom dia')).toBeTruthy();
    expect(screen.queryByTestId('vibe-text-composer')).toBeNull();
    // Fundo da vibe: roxo → azul.
    await fireEvent.press(screen.getByTestId('vibe-background'));
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        kind: 'text',
        style: 'blue',
        textItems: [{ t: 'bom dia', x: 0.5, y: 0.42, f: 'serif', c: 'yellow', b: 'solid', s: 1, a: 'left' }],
      }),
    );
  });

  test('tocar na vibe escreve outro texto (com o último jeito); tocar no texto edita; apagar tudo remove', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-text'));
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'primeiro');
    await fireEvent.press(screen.getByTestId('vibe-font-strong'));
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    await fireEvent.press(screen.getByTestId('vibe-canvas'));
    // O segundo já vem com a fonte do primeiro.
    expect(screen.getByTestId('vibe-font-strong').props.accessibilityState.selected).toBe(true);
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'segundo');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    expect(screen.getByText('segundo')).toBeTruthy();
    // Tocar no primeiro edita só ele; apagar o texto dele faz ele sumir.
    await fireEvent(screen.getByTestId('vibe-text-item-0'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(screen.getByTestId('vibe-text').props.value).toBe('primeiro');
    await fireEvent.changeText(screen.getByTestId('vibe-text'), '');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    expect(screen.queryByText('primeiro')).toBeNull();
    expect(screen.getAllByTestId(/^vibe-text-item-/)).toHaveLength(1);
  });

  test('arrastar o texto até a lixeira apaga; pinça aumenta', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-text'));
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'mover');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));
    await fireEvent.press(screen.getByTestId('vibe-add-text'));
    await fireEvent.changeText(screen.getByTestId('vibe-text'), 'apagar');
    await fireEvent.press(screen.getByTestId('vibe-text-done'));

    // Lixeira: perto do fim do cartão, no meio (tela de teste 750 x 1334: cartão de 520 x 924, a 4 px do topo).
    await act(async () => {
      fireGestureHandler(getByGestureTestId('vibe-text-pan-1'), [
        { state: State.BEGAN, translationX: 0, translationY: 0, absoluteX: 375, absoluteY: 300 },
        { state: State.ACTIVE, translationX: 0, translationY: 200, absoluteX: 375, absoluteY: 500 },
        { state: State.ACTIVE, translationX: 0, translationY: 500, absoluteX: 375, absoluteY: 864 },
        { state: State.END, translationX: 0, translationY: 500, absoluteX: 375, absoluteY: 864 },
      ]);
    });
    await waitFor(() => expect(screen.queryByText('apagar')).toBeNull());
    expect(screen.getByText('mover')).toBeTruthy();

    await act(async () => {
      fireGestureHandler(getByGestureTestId('vibe-text-pinch-0'), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1.5 },
        { state: State.ACTIVE, scale: 2 },
        { state: State.END, scale: 2 },
      ]);
    });
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const sent = (mockCreate.mock.calls[0] as unknown as [{ textItems: { t: string; s?: number }[] }])[0];
    expect(sent.textItems.map((i) => i.t)).toEqual(['mover']);
    expect(sent.textItems[0]!.s).toBe(2);
  });

  test('no máximo 8 textos', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-text'));
    for (let i = 0; i < 8; i++) {
      if (i > 0) await fireEvent.press(screen.getByTestId('vibe-add-text'));
      await fireEvent.changeText(screen.getByTestId('vibe-text'), `t${i}`);
      await fireEvent.press(screen.getByTestId('vibe-text-done'));
    }
    await fireEvent.press(screen.getByTestId('vibe-add-text'));
    expect(screen.queryByTestId('vibe-text-composer')).toBeNull();
    expect(screen.getByText('No máximo 8 textos por vibe.')).toBeTruthy();
  });

  test('compartilhar um post: abre já com o post (sem câmera) e publica como vibe de post', async () => {
    Object.assign(mockParams, { postId: 'p1', postUser: 'bia', postBody: 'ouçam', postUrl: 'https://open.spotify.com/track/x', postPlatform: 'spotify', postTitle: 'Faixa' });
    await wrap(<NewVibeScreen />);
    expect(screen.getByText('@bia')).toBeTruthy();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.queryByTestId('vibe-add-music')).toBeNull();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'post', postId: 'p1', style: 'violet', textItems: [] }));
  });
});

describe('Vibes: ver', () => {
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

});

describe('Vibes: ver no jeito do Story', () => {
  test('texto com música mostra o selo da música; arrastar para baixo fecha', async () => {
    mockVibesOf.som = [
      { ...textVibe('s1', 'com som'), preview_url: 'https://open.spotify.com/track/x', preview_platform: 'spotify', preview_title: 'Wait', preview_artist: 'M83' } as never,
    ];
    Object.assign(mockParams, { author: 'som' });
    await wrap(<VibeViewerScreen />);
    await waitFor(() => expect(screen.getByText('com som')).toBeTruthy());
    expect(screen.getByText('M83 · Wait')).toBeTruthy();
    // Pouco: volta. Bastante: fecha.
    await act(async () => {
      fireGestureHandler(getByGestureTestId('vibe-swipe'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 30 },
        { state: State.ACTIVE, translationY: 60 },
        { state: State.END, translationY: 60, velocityY: 100 },
      ]);
    });
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('vibe-swipe'), [
        { state: State.BEGAN, translationY: 0 },
        { state: State.ACTIVE, translationY: 100 },
        { state: State.ACTIVE, translationY: 200 },
        { state: State.END, translationY: 200, velocityY: 600 },
      ]);
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
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

describe('Nova vibe: música', () => {
  test('música da câmera: busca pelo nome, escolhe e vira a vibe de música (cartão grande)', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-music'));
    await fireEvent.changeText(screen.getByTestId('vibe-music-search'), 'midnight');
    await fireEvent.press(await screen.findByTestId('vibe-music-hit-d1'));
    await waitFor(() => expect(screen.getByText('Midnight City')).toBeTruthy());
    expect(mockPickSong).toHaveBeenCalledWith('d1');
    expect(screen.getByTestId('vibe-music-card')).toBeTruthy();
    expect(screen.queryByTestId('vibe-music-pill')).toBeNull();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ kind: 'music', linkPreviewId: 'lp1', style: 'violet', textItems: [] }));
  });

  test('foto com música: o selo em cima; colar o link também funciona; o X tira', async () => {
    mockPreviewLink.mockResolvedValue({ id: 'lp2', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', platform: 'spotify', kind: 'track', title: 'Wait', artist: 'M83', image_url: null });
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-shutter'));
    await fireEvent.press(await screen.findByTestId('vibe-add-music'));
    await fireEvent.changeText(screen.getByTestId('vibe-music-search'), 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    await fireEvent.press(await screen.findByTestId('vibe-music-link-hit'));
    expect(await screen.findByTestId('vibe-music-pill')).toBeTruthy();
    expect(screen.getByText('M83 · Wait')).toBeTruthy();
    expect(mockSearchSongs).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('vibe-publish'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'photo', linkPreviewId: 'lp2' })));
    await fireEvent.press(screen.getByTestId('vibe-music-pill-remove'));
    expect(screen.queryByTestId('vibe-music-pill')).toBeNull();
  });

  test('desistir da música na câmera volta para a câmera', async () => {
    await wrap(<NewVibeScreen />);
    await fireEvent.press(screen.getByTestId('vibe-mode-music'));
    expect(screen.getByTestId('vibe-music-picker')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vibe-music-close'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  });
});
