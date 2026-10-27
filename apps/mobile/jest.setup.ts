// RN 0.88: o AssetRegistry do react-native mudou de lugar e o jest-expo 58 só imita o caminho antigo
// (react-native/asset-registry). Sem isto, fontes e imagens (expo-asset) quebram nos testes.
jest.mock('react-native/src/private/assets/AssetRegistry', () => {
  const meta = {
    fileSystemLocation: '/x',
    httpServerLocation: '/assets/x',
    scales: [1],
    fileHashes: ['md5'],
    name: 'name',
    exists: true,
    type: 'type',
    hash: 'md5',
    uri: 'uri',
    width: 1,
    height: 1,
  };
  return { AssetRegistry: { registerAsset: jest.fn(() => 1), getAssetByID: jest.fn(() => meta) } };
});

// Variáveis falsas para que módulos que criam o cliente Supabase possam ser importados nos testes.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-key';

// O localStorage do expo-sqlite e o cofre do sistema não existem no Jest: versões em memória.
jest.mock('expo-sqlite/localStorage/install', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return {};
});
jest.mock('expo-secure-store', () => {
  const vault = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: async (k: string) => vault.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void vault.set(k, v),
    deleteItemAsync: async (k: string) => void vault.delete(k),
  };
});

// expo-video usa um módulo nativo: no Jest, um player de mentira e uma view vazia.
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }), playing: false, currentTime: 0, duration: 0 }),
  VideoView: () => null,
}));

// expo-audio usa módulo nativo: no Jest, um player falso que só registra play/pause.
jest.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), loop: false, muted: false }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 0, playing: false, didJustFinish: false, playbackState: 'idle' }),
}));

// Reanimated/Worklets dependem do módulo nativo: no Jest, as versões de mentira das bibliotecas.
// Reanimated 4.7 no Jest (iOS/Android): a inicialização chama setCSSEventHandler, que a versão JS
// (a usada no Jest) não tem e dá erro. Pula essa inicialização; o resto do mock funciona igual.
jest.mock('react-native-reanimated/src/initializers', () => ({ initializeReanimatedModule: () => undefined }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
// Gesture Handler: o módulo nativo de mentira da própria biblioteca (gestos testáveis com jest-utils).
require('react-native-gesture-handler/jestSetup');

// Gesture Handler 3: GestureDetector exige o GestureHandlerRootView acima dele (o app tem na raiz,
// em _layout.tsx, e o MediaViewer no Modal). Nos testes as telas são montadas soltas, sem a raiz.
jest.mock('react-native-gesture-handler/lib/module/v3/detectors/useEnsureGestureHandlerRootView', () => ({ useEnsureGestureHandlerRootView: () => undefined }));

// expo-notifications 58: o módulo nativo de mentira do jest-expo não devolve a inscrição (com
// remove) e o setNotificationHandler quebra na segunda vez que é chamado.
jest.mock('expo-notifications/build/NotificationsHandlerModule', () => ({
  __esModule: true,
  default: { addListener: () => ({ remove: () => undefined }), handleNotificationAsync: async () => undefined },
}));

// expo-camera usa módulo nativo: no Jest, uma câmera de mentira (tirar foto devolve um arquivo
// falso) e permissão já dada. Os testes trocam globalThis.__mockCameraPermission para negar.
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: 'file:///camera/foto.jpg', width: 1080, height: 1920 }),
      recordAsync: async () => ({ uri: 'file:///camera/video.mp4' }),
      stopRecording: () => undefined,
    }));
    React.useEffect(() => {
      (props.onCameraReady as (() => void) | undefined)?.();
    }, []);
    return React.createElement(View, { testID: 'camera-view' });
  });
  const perm = () => (globalThis as { __mockCameraPermission?: object }).__mockCameraPermission ?? { granted: true, canAskAgain: true, status: 'granted' };
  return {
    CameraView,
    useCameraPermissions: () => [perm(), async () => perm()],
    useMicrophonePermissions: () => [{ granted: true, canAskAgain: true, status: 'granted' }, async () => ({ granted: true })],
  };
});

// AdMob usa módulo nativo: no Jest, um SDK de mentira. O anúncio que o useNativeAd devolve é
// controlado pelos testes em globalThis.__mockNativeAd ({ status, nativeAd }); sem nada, sem estoque.
jest.mock('react-native-google-mobile-ads', () => {
  const { View } = require('react-native');
  const sdk = { setRequestConfiguration: jest.fn(async () => undefined), initialize: jest.fn(async () => []) };
  return {
    __esModule: true,
    default: () => sdk,
    __sdk: sdk,
    MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
    NativeAdChoicesPlacement: { TOP_LEFT: 0, TOP_RIGHT: 1, BOTTOM_RIGHT: 2, BOTTOM_LEFT: 3 },
    NativeMediaAspectRatio: { ANY: 1, LANDSCAPE: 2, PORTRAIT: 3, SQUARE: 4 },
    NativeAssetType: { ADVERTISER: 'advertiser', BODY: 'body', CALL_TO_ACTION: 'callToAction', HEADLINE: 'headline', ICON: 'icon', IMAGE: 'image' },
    TestIds: { NATIVE: 'test-native-unit' },
    useNativeAd: jest.fn((opts: { adUnitId: string | null; requestOptions?: unknown }) => {
      const mock = (globalThis as { __mockNativeAd?: { status: string; nativeAd: unknown } }).__mockNativeAd;
      const base = { autoLoad: true, retry: jest.fn(), destroy: jest.fn() };
      if (!opts.adUnitId || !mock) return { ...base, status: 'no-fill', nativeAd: null, error: { reason: 'no-fill', phase: 'load' } };
      return { ...base, status: mock.status, nativeAd: mock.status === 'loaded' ? mock.nativeAd : null, error: null };
    }),
    NativeAdView: ({ children, nativeAd: _n, ...props }: { children?: unknown; nativeAd?: unknown }) => require('react').createElement(View, props, children),
    NativeAsset: ({ children }: { children: unknown }) => children,
    NativeMediaView: (props: object) => require('react').createElement(View, { ...props, testID: 'ad-media' }),
  };
});
// Nos testes o "módulo nativo" do AdMob existe (é o de mentira acima); o caso do Expo Go, sem ele,
// é testado trocando este retorno.
jest.mock('./src/lib/ads-native-present', () => ({ nativeAdsPresent: jest.fn(() => true) }));
