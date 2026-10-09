import { Redirect } from 'expo-router';

/** Destino do login social. A sessão já foi trocada em signInWithProvider; só volta ao início. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
