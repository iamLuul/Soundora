import { Stack } from 'expo-router';
import { ErrorScreen } from '../components/ErrorScreen';

/** Endereço que não existe no app: a tela 404. */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ErrorScreen code={404} />
    </>
  );
}
