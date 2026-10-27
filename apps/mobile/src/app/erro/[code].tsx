import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ErrorScreen, isErrorScreenCode } from '../../components/ErrorScreen';
import { useAuth } from '../../lib/auth';

/**
 * As telas de erro por endereço (/erro/401, /erro/403, /erro/429, /erro/500, /erro/503 e
 * /erro/504). Código fora da lista vira 404.
 */
export default function ErrorRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { signOut } = useAuth();
  const n = Number(code);
  const retry = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ErrorScreen code={isErrorScreenCode(n) ? n : 404} onRetry={retry} onSignIn={signOut} />
    </>
  );
}
