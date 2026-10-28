/**
 * No Expo Go do Android o módulo nativo de push não existe: só importar expo-notifications
 * derrubava o app. Aqui o módulo nativo falta e o import da biblioteca quebra, como no aparelho,
 * mesmo com o aparelho dizendo que não é o Expo Go (aconteceu no Android).
 */
import { disablePush, enablePush, pushAvailability } from '../src/lib/push';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare', expoConfig: { extra: { eas: { projectId: 'x' } } } },
  ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone', Bare: 'bare' },
}));
jest.mock('expo', () => ({ requireOptionalNativeModule: (name: string) => (name === 'ExpoTopicSubscriptionModule' ? null : {}) }));
jest.mock('react-native', () => ({ Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => {
  throw new Error("Cannot find native module 'ExpoTopicSubscriptionModule'");
});
jest.mock('../src/lib/api', () => ({ registerPushToken: jest.fn(), unregisterPushToken: jest.fn() }));

test('no Expo Go o app abre sem expo-notifications, e o push fica indisponível', async () => {
  expect(pushAvailability()).toEqual({ ok: false, reason: 'expo_go' });
  await expect(enablePush()).rejects.toThrow();
  await expect(disablePush()).resolves.toBeUndefined();
});
