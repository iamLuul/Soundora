// Anúncios: posts anunciados no feed, vibes anunciadas na fila, selo "Patrocinado", sem
// personalização e regras de idade do SDK.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FeedScreen from '../src/app/(tabs)/index';
import VibeViewerScreen from '../src/app/vibes/[author]';
import { AdPostCard } from '../src/components/ads/AdPostCard';
import { AdVibe } from '../src/components/ads/AdVibe';
import { withAds } from '../src/lib/ads';
import { adsSdk, FEED_AD_REQUEST, initAds, nativeAdUnitId, VIBE_AD_REQUEST } from '../src/lib/ads-sdk';
import i18n from '../src/lib/i18n';
import type { FeedItem } from '../src/lib/types';

const mockAds = { ready: true, feedEvery: 2, vibesEvery: 1 };
jest.mock('../src/lib/ads', () => ({ ...jest.requireActual('../src/lib/ads'), useAds: () => mockAds }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseUrl: 'http://localhost:54321' }));
const mockParams: Record<string, string> = {};
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: () => mockBack(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: () => ({ isPlaying: false }) }));
jest.mock('../src/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, profile: { id: 'me', username: 'raul', display_name: 'Raul', avatar_url: null } }),
}));

function mockPost(id: string): FeedItem {
  return {
    id,
    body: `post ${id}`,
    genre: null,
    like_count: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
    liked_by_me: false,
    author_id: 'other',
    author_username: 'outra',
    author_display_name: 'Outra',
    author_avatar_url: null,
    preview_url: null,
    preview_platform: null,
    preview_kind: null,
    preview_title: null,
    preview_artist: null,
    preview_image_url: null,
    score: 1,
    genres: [],
    media: [],
    post_type: 'text',
  } as unknown as FeedItem;
}
function textVibe(id: string, text: string) {
  return {
    id,
    kind: 'text',
    media_path: null,
    duration_ms: null,
    text,
    style: 'violet',
    created_at: new Date().toISOString(),
    seen: false,
    view_count: null,
    preview_url: null,
    preview_platform: null,
    preview_title: null,
    preview_artist: null,
    preview_image_url: null,
    post_id: null,
    post_body: null,
    post_author_username: null,
    post_author_avatar_url: null,
    text_x: null,
    text_y: null,
    preview_audio_url: null,
    text_items: null,
  };
}
const mockVibesOf: Record<string, ReturnType<typeof textVibe>[]> = { b: [textVibe('b1', 'oi da bia')], c: [textVibe('c1', 'oi do caio')] };

jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  fetchFeed: async () => ['p1', 'p2', 'p3', 'p4', 'p5'].map(mockPost),
  fetchFollowingFeed: async () => [],
  fetchMyFollowingIds: async () => [],
  fetchSuggestedAccounts: async () => [],
  fetchVibesTray: async () => [],
  fetchUnreadNotifications: async () => 0,
  fetchVibesOf: async (author: string) => mockVibesOf[author] ?? [],
  markVibeSeen: async () => undefined,
}));

const LOADED_AD = {
  status: 'loaded',
  nativeAd: {
    responseId: 'r1',
    headline: 'Fone Bom',
    body: 'Som limpo o dia todo.',
    advertiser: 'Loja X',
    callToAction: 'Comprar',
    icon: null,
    images: null,
    mediaContent: { aspectRatio: 1.5, hasVideoContent: false, duration: 0 },
  },
};
const setAd = (ad: unknown) => ((globalThis as { __mockNativeAd?: unknown }).__mockNativeAd = ad);

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  setAd(LOADED_AD);
  for (const k of Object.keys(mockParams)) delete mockParams[k];
  jest.clearAllMocks();
});

describe('posição dos anúncios', () => {
  test('um a cada N itens, nunca no fim, e as posições não mudam quando chegam mais itens', () => {
    const kinds = (n: number, every: number) => withAds([...Array(n).keys()], every).map((r) => (r.kind === 'ad' ? `ad${r.slot}` : r.item));
    expect(kinds(5, 2)).toEqual([0, 1, 'ad1', 2, 3, 'ad2', 4]);
    expect(kinds(4, 2)).toEqual([0, 1, 'ad1', 2, 3]);
    expect(kinds(6, 2).slice(0, 7)).toEqual([0, 1, 'ad1', 2, 3, 'ad2', 4]);
    expect(kinds(5, 0)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('SDK: sem personalização e regras de idade', () => {
  test('pedidos nunca personalizados; menor de 18 marcado e só anúncios para adolescentes', async () => {
    const { __sdk: sdk } = jest.requireMock('react-native-google-mobile-ads') as { __sdk: { setRequestConfiguration: jest.Mock; initialize: jest.Mock } };
    expect(FEED_AD_REQUEST).toMatchObject({ requestNonPersonalizedAdsOnly: true, startVideoMuted: true });
    expect(VIBE_AD_REQUEST).toMatchObject({ requestNonPersonalizedAdsOnly: true });
    await expect(initAds({ minor: true })).resolves.toBe(true);
    expect(sdk.setRequestConfiguration).toHaveBeenLastCalledWith({
      maxAdContentRating: 'T',
      tagForUnderAgeOfConsent: true,
      tagForChildDirectedTreatment: false,
    });
    expect(sdk.initialize).toHaveBeenCalled();
    await initAds({ minor: false });
    expect(sdk.setRequestConfiguration).toHaveBeenLastCalledWith({
      maxAdContentRating: 'MA',
      tagForUnderAgeOfConsent: false,
      tagForChildDirectedTreatment: false,
    });
  });

  test('unidade de anúncio: a do ambiente; sem ela, a de teste só no desenvolvimento', () => {
    expect(nativeAdUnitId()).toBe('test-native-unit');
    process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS = 'ca-app-pub-1/2';
    process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID = 'ca-app-pub-1/2';
    try {
      expect(nativeAdUnitId()).toBe('ca-app-pub-1/2');
    } finally {
      delete process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS;
      delete process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID;
    }
  });
});

describe('Expo Go (sem o módulo nativo do AdMob)', () => {
  test('sem o módulo nativo: sem anúncio no feed, vibe anunciada pulada e SDK não inicia', async () => {
    const present = jest.requireMock('../src/lib/ads-native-present') as { nativeAdsPresent: jest.Mock };
    present.nativeAdsPresent.mockReturnValue(false);
    try {
      expect(adsSdk()).toBeNull();
      expect(nativeAdUnitId()).toBeNull();
      await expect(initAds({ minor: false })).resolves.toBe(false);
      await render(<AdPostCard slot={1} />);
      expect(screen.queryByTestId('ad-post-1')).toBeNull();
      const onDone = jest.fn();
      await render(<AdVibe slot={1} hasPrevious={false} onDone={onDone} onPrevious={jest.fn()} onClose={jest.fn()} />);
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(screen.queryByTestId('ad-vibe-1')).toBeNull();
    } finally {
      present.nativeAdsPresent.mockReturnValue(true);
    }
  });
});

describe('post anunciado', () => {
  test('mostra o selo Patrocinado, o anunciante e o botão do anúncio', async () => {
    await render(<AdPostCard slot={1} />);
    expect(screen.getByTestId('ad-post-1')).toBeTruthy();
    expect(screen.getByText('Patrocinado')).toBeTruthy();
    expect(screen.getByText('Fone Bom')).toBeTruthy();
    expect(screen.getByText('Loja X')).toBeTruthy();
    expect(screen.getByText('Comprar')).toBeTruthy();
  });

  test('sem anúncio (sem estoque ou carregando), não ocupa espaço', async () => {
    setAd(null);
    await render(<AdPostCard slot={1} />);
    expect(screen.queryByTestId('ad-post-1')).toBeNull();
    setAd({ status: 'loading', nativeAd: null });
    await render(<AdPostCard slot={2} />);
    expect(screen.queryByTestId('ad-post-2')).toBeNull();
  });

  test('no feed da Início: aviso na primeira vez e um anúncio a cada N posts, nunca no fim', async () => {
    await wrap(<FeedScreen />);
    await waitFor(() => expect(screen.getByText('post p2')).toBeTruthy());
    expect(screen.getByText('O Soundhora agora tem anúncios')).toBeTruthy();
    // Um a cada 2 posts: o primeiro anúncio vem logo depois do 2º post.
    const order: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') return void (['post p2', 'post p3'].includes(node) && order.push(node));
      if (Array.isArray(node)) return node.forEach(walk);
      const n = node as { props?: { testID?: string }; children?: unknown } | null;
      if (!n) return;
      if (n.props?.testID === 'ad-post-1') order.push('ad-post-1');
      walk(n.children);
    };
    walk(screen.toJSON());
    expect(order).toEqual(['post p2', 'ad-post-1', 'post p3']);
    // Fechar o aviso: não aparece de novo.
    await fireEvent.press(screen.getByTestId('coach-ads-next'));
    expect(screen.queryByText('O Soundhora agora tem anúncios')).toBeNull();
  });
});

describe('vibe anunciada', () => {
  test('selo, pular e voltar ficam fora do anúncio; pular segue para a próxima pessoa', async () => {
    const onDone = jest.fn();
    const onPrevious = jest.fn();
    await render(<AdVibe slot={1} hasPrevious onDone={onDone} onPrevious={onPrevious} onClose={jest.fn()} />);
    expect(screen.getByTestId('ad-vibe-sponsored')).toBeTruthy();
    expect(screen.getByText('Fone Bom')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ad-vibe-prev'));
    expect(onPrevious).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('ad-vibe-skip'));
    expect(onDone).toHaveBeenCalled();
  });

  test('sem anúncio: pula sozinha', async () => {
    setAd(null);
    const onDone = jest.fn();
    await render(<AdVibe slot={1} hasPrevious={false} onDone={onDone} onPrevious={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByTestId('ad-vibe-prev')).toBeNull();
  });

  test('carregando há muito tempo: pula sozinha', async () => {
    jest.useFakeTimers();
    try {
      setAd({ status: 'loading', nativeAd: null });
      const onDone = jest.fn();
      await render(<AdVibe slot={1} hasPrevious={false} onDone={onDone} onPrevious={jest.fn()} onClose={jest.fn()} />);
      expect(onDone).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      expect(onDone).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('na fila: entre duas pessoas aparece a vibe anunciada, e pular leva à próxima', async () => {
    Object.assign(mockParams, { author: 'b', queue: 'c' });
    await wrap(<VibeViewerScreen />);
    await waitFor(() => expect(screen.getByText('oi da bia')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('vibe-next'));
    expect(screen.getByTestId('ad-vibe-1')).toBeTruthy();
    expect(screen.getByText('Patrocinado')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ad-vibe-skip'));
    await waitFor(() => expect(screen.getByText('oi do caio')).toBeTruthy());
    // Depois da última pessoa não há anúncio: fecha.
    await fireEvent.press(screen.getByTestId('vibe-next'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
