import { Platform } from 'react-native';
import type * as GoogleMobileAds from 'react-native-google-mobile-ads';
import { nativeAdsPresent } from './ads-native-present';

/**
 * O SDK do AdMob (só no celular; na web, ads-sdk.web.ts não faz nada).
 *
 * A biblioteca só é carregada quando o módulo nativo existe (app compilado). No Expo Go ela não
 * existe: nada é importado, os anúncios não aparecem e o resto do app funciona normalmente.
 *
 * Unidade de anúncio nativo: EXPO_PUBLIC_ADMOB_NATIVE_ANDROID / EXPO_PUBLIC_ADMOB_NATIVE_IOS (não
 * são segredo: vão dentro do app). Sem elas, o app de desenvolvimento usa a unidade de teste do
 * Google; o app publicado, sem elas, não mostra anúncio nenhum (nunca o de teste em produção).
 */
let cached: typeof GoogleMobileAds | null = null;

/** A biblioteca do AdMob, ou null quando o módulo nativo não está no app (Expo Go). */
export function adsSdk(): typeof GoogleMobileAds | null {
  if (!nativeAdsPresent()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carregar só quando o módulo nativo existe
  cached ??= require('react-native-google-mobile-ads') as typeof GoogleMobileAds;
  return cached;
}

export function nativeAdUnitId(): string | null {
  const sdk = adsSdk();
  if (!sdk) return null;
  const fromEnv = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS : process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID;
  if (fromEnv) return fromEnv;
  return __DEV__ ? sdk.TestIds.NATIVE : null;
}

// Valores dos enums da biblioteca, escritos aqui para não precisar carregá-la só para isso.
const AD_CHOICES_TOP_RIGHT = 1 as GoogleMobileAds.NativeAdChoicesPlacement;
const ASPECT_LANDSCAPE = 2 as GoogleMobileAds.NativeMediaAspectRatio;
const ASPECT_PORTRAIT = 3 as GoogleMobileAds.NativeMediaAspectRatio;

/**
 * Pedido de anúncio: nunca personalizado (o Google não usa o histórico da pessoa para escolher)
 * e vídeo começando sem som. Nada da pessoa vai junto no pedido.
 */
const BASE: GoogleMobileAds.NativeAdRequestOptions = {
  requestNonPersonalizedAdsOnly: true,
  startVideoMuted: true,
  adChoicesPlacement: AD_CHOICES_TOP_RIGHT,
};
/** Post anunciado: imagem deitada, como as do feed. */
export const FEED_AD_REQUEST: GoogleMobileAds.NativeAdRequestOptions = { ...BASE, aspectRatio: ASPECT_LANDSCAPE };
/** Vibe anunciada: imagem em pé, como as vibes. */
export const VIBE_AD_REQUEST: GoogleMobileAds.NativeAdRequestOptions = { ...BASE, aspectRatio: ASPECT_PORTRAIT };

let started: Promise<boolean> | null = null;
let startedFor: boolean | null = null;

/**
 * Configura e inicia o SDK uma vez. Menor de 18: marcado como abaixo da idade de consentimento e
 * anúncios até a classificação "T" (adolescentes); adulto: até "MA". Para todos: sem
 * personalização (veja os pedidos acima). Sem o módulo nativo (Expo Go): false, sem anúncios.
 */
export async function initAds({ minor }: { minor: boolean }): Promise<boolean> {
  const sdk = adsSdk();
  if (!sdk) return false;
  if (started && startedFor === minor) return started;
  startedFor = minor;
  started = (async () => {
    await sdk.default().setRequestConfiguration({
      maxAdContentRating: minor ? sdk.MaxAdContentRating.T : sdk.MaxAdContentRating.MA,
      tagForUnderAgeOfConsent: minor,
      tagForChildDirectedTreatment: false,
    });
    await sdk.default().initialize();
    return true;
  })().catch(() => {
    started = null;
    startedFor = null;
    return false;
  });
  return started;
}
