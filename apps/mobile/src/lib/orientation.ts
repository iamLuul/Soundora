import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

function lock(orientation: ScreenOrientation.OrientationLock): void {
  if (Platform.OS === 'web') return;
  try {
    ScreenOrientation.lockAsync(orientation).catch(() => undefined);
  } catch {
    // Sem o módulo (testes): nada a fazer.
  }
}

/**
 * O app é em pé. Só o vídeo em tela cheia pode deitar (vídeo deitado vira a tela sozinho).
 * No app.json a orientação é "default" para o iPhone permitir girar; aqui trava em pé.
 */
export function lockPortrait(): void {
  lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
}

/** Tela cheia de vídeo: deitado, gira para deitado; em pé, segue em pé. */
export function videoFullscreenOrientation(landscape: boolean): void {
  lock(landscape ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP);
}
