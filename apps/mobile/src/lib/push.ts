import { useQueryClient } from '@tanstack/react-query';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
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

/** Rodando dentro do Expo Go (o app da loja), não num app compilado do Soundhora. */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * expo-notifications só é carregado fora do Expo Go. No Expo Go do Android (SDK 53+) o módulo
 * nativo de push não existe e só importar a biblioteca já derrubava o app ("Cannot find native
 * module 'ExpoTopicSubscriptionModule'"). No Expo Go o push não funciona mesmo; o resto do app sim.
 */
const Notifications: typeof NotificationsModule | null = inExpoGo
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports -- carregar só fora do Expo Go
    (require('expo-notifications') as typeof NotificationsModule);

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export function pushAvailability(): PushAvailability {
  if (!Device.isDevice) return { ok: false, reason: 'emulator' };
  if (inExpoGo || !Notifications) return { ok: false, reason: 'expo_go' };
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
 * O token só vai para o banco do Soundhora (push_tokens) e para o serviço de push da Expo.
 */
export async function enablePush(): Promise<boolean> {
  const availability = pushAvailability();
  if (!availability.ok || !Notifications) throw new AppError('push_unavailable', availability.ok ? 'expo_go' : availability.reason);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Soundhora',
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

Notifications?.setNotificationHandler({
  // Com o app aberto, mostra o aviso no topo também.
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Último push tocado (sem a biblioteca, no Expo Go: nunca há). */
const useLastNotificationResponse = Notifications ? Notifications.useLastNotificationResponse : () => null;

/** Tocar num push abre a tela indicada (só caminhos internos do app). */
export function usePushNavigation(enabled: boolean): void {
  const qc = useQueryClient();
  const last = useLastNotificationResponse();

  // Chegou um push com o app aberto: o sino e a lista se atualizam na hora.
  useEffect(() => {
    if (!enabled || !Notifications) return;
    const sub = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => sub.remove();
  }, [enabled, qc]);

  useEffect(() => {
    if (!enabled || !last) return;
    const url = last.notification.request.content.data?.url;
    if (typeof url === 'string' && /^\/[a-z0-9/_-]*$/i.test(url)) {
      router.push(url as '/notifications');
    }
    Notifications?.clearLastNotificationResponse();
  }, [enabled, last]);
}
