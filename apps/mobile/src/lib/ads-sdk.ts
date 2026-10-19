import { Platform } from 'react-native';
import mobileAds, {
  MaxAdContentRating,
  NativeAdChoicesPlacement,
  NativeMediaAspectRatio,
  TestIds,
  type NativeAdRequestOptions,
} from 'react-native-google-mobile-ads';

/**
 * O SDK do AdMob (só no celular; na web, ads-sdk.web.ts não faz nada).
 *
 * Unidade de anúncio nativo: EXPO_PUBLIC_ADMOB_NATIVE_ANDROID / EXPO_PUBLIC_ADMOB_NATIVE_IOS (não
 * são segredo: vão dentro do app). Sem elas, o app de desenvolvimento usa a unidade de teste do
 * Google; o app publicado, sem elas, não mostra anúncio nenhum (nunca o de teste em produção).
 */
export function nativeAdUnitId(): string | null {
  const fromEnv = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS : process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID;
  if (fromEnv) return fromEnv;
  return __DEV__ ? TestIds.NATIVE : null;
}

/**
 * Pedido de anúncio: nunca personalizado (o Google não usa o histórico da pessoa para escolher)
 * e vídeo começando sem som. Nada da pessoa vai junto no pedido.
 */
const BASE: NativeAdRequestOptions = {
  requestNonPersonalizedAdsOnly: true,
  startVideoMuted: true,
  adChoicesPlacement: NativeAdChoicesPlacement.TOP_RIGHT,
};
/** Post anunciado: imagem deitada, como as do feed. */
export const FEED_AD_REQUEST: NativeAdRequestOptions = { ...BASE, aspectRatio: NativeMediaAspectRatio.LANDSCAPE };
/** Vibe anunciada: imagem em pé, como as vibes. */
export const VIBE_AD_REQUEST: NativeAdRequestOptions = { ...BASE, aspectRatio: NativeMediaAspectRatio.PORTRAIT };

let started: Promise<boolean> | null = null;
let startedFor: boolean | null = null;

/**
 * Configura e inicia o SDK uma vez. Menor de 18: marcado como abaixo da idade de consentimento e
 * anúncios até a classificação "T" (adolescentes); adulto: até "MA". Para todos: sem
 * personalização (veja os pedidos acima).
 */
export async function initAds({ minor }: { minor: boolean }): Promise<boolean> {
  if (started && startedFor === minor) return started;
  startedFor = minor;
  started = (async () => {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: minor ? MaxAdContentRating.T : MaxAdContentRating.MA,
      tagForUnderAgeOfConsent: minor,
      tagForChildDirectedTreatment: false,
    });
    await mobileAds().initialize();
    return true;
  })().catch(() => {
    started = null;
    startedFor = null;
    return false;
  });
  return started;
}
