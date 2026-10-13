import '../lib/i18n';
import { Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold, useFonts } from '@expo-google-fonts/montserrat';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../lib/auth';
import { useLiveNotifications } from '../lib/live';
import { usePushNavigation } from '../lib/push';
import { colors, fonts } from '../theme';
import { AccountLoadFailed } from '../components/AccountLoadFailed';
import { AppSkeleton } from '../components/Skeleton';
import { ToastHost } from '../components/Toast';

SplashScreen.preventAutoHideAsync();

// No celular, "voltar para o app" conta como foco: as consultas (ex.: notificações) se atualizam.
// (Na Web o React Query já usa o foco da aba.)
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RootNavigator() {
  const { loading, session, profile, profileFailed } = useAuth();
  const [fontsLoaded] = useFonts({ Montserrat_400Regular, Montserrat_600SemiBold, Montserrat_700Bold });
  const ready = fontsLoaded && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Abrindo (fontes e sessão): o esqueleto do app. Na web ele já vem no HTML, antes do JavaScript.
  if (!ready) return <AppSkeleton />;

  // Entrou, mas o perfil não carregou: não dá para saber se falta o onboarding. Nada de
  // cadastro nem de abas até confirmar (tentar de novo ou sair).
  if (session && profileFailed) return <AccountLoadFailed />;

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;
  return <Navigator signedIn={signedIn} onboarded={onboarded} me={onboarded && profile ? { id: profile.id, username: profile.username } : null} />;
}

function Navigator({ signedIn, onboarded, me }: { signedIn: boolean; onboarded: boolean; me: { id: string; username: string } | null }) {
  // Tocar num push abre a tela dele (só depois do login e do onboarding).
  usePushNavigation(onboarded);
  // Curtidas, comentários, respostas e seguidores chegam na hora, sem puxar para atualizar.
  useLiveNotifications(me);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.regular, fontSize: 16 },
        headerShadowVisible: false, // Figma: sem linha embaixo do cabeçalho
        headerBackButtonDisplayMode: 'minimal', // só a seta, como no Figma
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Sem login: só a tela de entrada. */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Logado sem perfil: onboarding obrigatório. */}
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      {/* Logado com perfil: o app. */}
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="u/[username]" options={{ title: '' }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="people/[username]" options={{ headerShown: false }} />
        <Stack.Screen name="liked/[username]" options={{ headerShown: false }} />
        <Stack.Screen name="genre/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="album/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="vibes/new" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="vibes/[author]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="settings/index" options={{ title: '' }} />
        <Stack.Screen name="settings/profile" options={{ title: '' }} />
        <Stack.Screen name="settings/username" options={{ title: '' }} />
        <Stack.Screen name="settings/password" options={{ title: '' }} />
        <Stack.Screen name="settings/streaming" options={{ title: '' }} />
        <Stack.Screen name="settings/blocked" options={{ title: '' }} />
        <Stack.Screen name="settings/favorites" options={{ title: '' }} />
        <Stack.Screen name="settings/delete-account" options={{ title: '' }} />
        <Stack.Screen name="admin" options={{ title: '' }} />
      </Stack.Protected>

      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      {/* Termos e privacidade abrem com ou sem login (o cadastro mostra os links). */}
      <Stack.Screen name="legal/[doc]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Web: título da aba do navegador (as telas sem título deixavam a página sem <title>). */}
      <Head>
        <title>Soundora</title>
      </Head>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
          <ToastHost />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
