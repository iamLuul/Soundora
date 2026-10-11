import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'expo-sqlite/localStorage/install';
import { registerPushToken, unregisterPushToken } from './api';
import { AppError } from './errors';

/** Token deste aparelho, guardado para descadastrar ao sair ou desligar. */
const KEY = 'soundora.push-token';

export type PushAvailability =
  | { ok: true }
  /** emulator: emulador/simulador · expo_go: o Expo Go não recebe push · no_project: falta o projectId do EAS */
  | { ok: false; reason: 'emulator' | 'expo_go' | 'no_project' | 'web' };

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export function pushAvailability(): PushAvailability {
  if (!Device.isDevice) return { ok: false, reason: 'emulator' };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return { ok: false, reason: 'expo_go' };
  if (!projectId()) return { ok: false, reason: 'no_project' };
  return { ok: true };
}

export function pushEnabled(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/**
 * Pede a permissão do sistema e cadastra o aparelho. Devolve false se a pessoa negou.
 * O token só vai para o banco do Soundora (push_tokens) e para o serviço de push da Expo.
 */
export async function enablePush(): Promise<boolean> {
  const availability = pushAvailability();
  if (!availability.ok) throw new AppError('push_unavailable', availability.reason);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Soundora',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  localStorage.setItem(KEY, token);
  return true;
}

/** Descadastra este aparelho (ao desligar nas Configurações e ao sair da conta). */
export async function disablePush(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    // sem armazenamento: nada a descadastrar
  }
  if (token) await unregisterPushToken(token).catch(() => undefined);
}

Notifications.setNotificationHandler({
  // Com o app aberto, mostra o aviso no topo também.
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Tocar num push abre a tela indicada (só caminhos internos do app). */
export function usePushNavigation(enabled: boolean): void {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!enabled || !last) return;
    const url = last.notification.request.content.data?.url;
    if (typeof url === 'string' && /^\/[a-z0-9/_-]*$/i.test(url)) {
      router.push(url as '/notifications');
    }
    Notifications.clearLastNotificationResponse();
  }, [enabled, last]);
}
