import Constants from 'expo-constants';

/**
 * Versão do app como a pessoa vê: GRANDE.MÉDIA.PEQUENA.MÊS.ANO (ex.: 0.1.0.10.2026).
 * Vem de version.json (pelo app.config.js); as lojas recebem só os 3 primeiros números.
 */
export const APP_VERSION: string =
  (Constants.expoConfig?.extra as { displayVersion?: string } | undefined)?.displayVersion ?? Constants.expoConfig?.version ?? '';
