import type { PushAvailability } from './push';

// Web: sem push por enquanto (as notificações aparecem na tela de Notificações).
export function pushAvailability(): PushAvailability {
  return { ok: false, reason: 'web' };
}
export function pushEnabled(): boolean {
  return false;
}
export async function enablePush(): Promise<boolean> {
  return false;
}
export async function disablePush(): Promise<void> {}
export function usePushNavigation(_enabled: boolean): void {}
