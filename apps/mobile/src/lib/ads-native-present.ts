import { TurboModuleRegistry } from 'react-native';

/**
 * O módulo nativo do AdMob está neste app? Só existe no app compilado (development build ou o
 * app das lojas). No Expo Go ele não existe, e a biblioteca quebraria o app ao ser importada
 * (ela pede o módulo com getEnforcing). `get` só devolve null, sem quebrar.
 */
export function nativeAdsPresent(): boolean {
  try {
    return TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null;
  } catch {
    return false;
  }
}
