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
 * O app é em pé. Só o vídeo em tela cheia pode girar (seguindo o celular).
 * No app.json a orientação é "default" para o iPhone permitir girar; aqui trava em pé.
 */
export function lockPortrait(): void {
  lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
}

/**
 * Tela cheia de vídeo: segue o celular. Abre na posição em que ele está (em pé fica em pé) e, se a
 * pessoa girar, a tela gira junto. O vídeo se encaixa inteiro (sem esticar) em qualquer posição.
 */
export function followDeviceOrientation(): void {
  if (Platform.OS === 'web') return;
  try {
    ScreenOrientation.unlockAsync().catch(() => undefined);
  } catch {
    // Sem o módulo (testes): nada a fazer.
  }
}
