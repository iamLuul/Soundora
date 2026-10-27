import Constants from 'expo-constants';

/**
 * Versão do app como a pessoa vê: GRANDE.MÉDIA.PEQUENA.MÊS.ANO (ex.: 0.1.0.10.2026).
 * Vem de version.json (pelo app.config.js); as lojas recebem só os 3 primeiros números.
 */
export const APP_VERSION: string =
  (Constants.expoConfig?.extra as { displayVersion?: string } | undefined)?.displayVersion ?? Constants.expoConfig?.version ?? '';

/** GRANDE = 0: o app ainda está em beta. */
export const IS_BETA = APP_VERSION.startsWith('0.');

/** Como aparece nas Configurações: "0.40.1.10.26 (beta)". */
export const APP_VERSION_LABEL = IS_BETA ? `${APP_VERSION} (beta)` : APP_VERSION;
