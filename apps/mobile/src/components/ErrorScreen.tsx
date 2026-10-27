import Ionicons from '@expo/vector-icons/Ionicons';
import Head from 'expo-router/head';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, space, text } from '../theme';
import { Button } from './ui';

/** Os códigos que têm tela própria. */
export const ERROR_SCREEN_CODES = [401, 403, 404, 429, 500, 503, 504] as const;
export type ErrorScreenCode = (typeof ERROR_SCREEN_CODES)[number];

export const isErrorScreenCode = (n: number): n is ErrorScreenCode => (ERROR_SCREEN_CODES as readonly number[]).includes(n);

const ICON: Record<ErrorScreenCode, React.ComponentProps<typeof Ionicons>['name']> = {
  401: 'log-in-outline',
  403: 'lock-closed-outline',
  404: 'compass-outline',
  429: 'hourglass-outline',
  500: 'bug-outline',
  503: 'construct-outline',
  504: 'timer-outline',
};

/**
 * Tela de erro (401, 403, 404, 429, 500, 503 e 504): o código grande, o que aconteceu em
 * linguagem simples e o que dá para fazer (voltar ao início, tentar de novo ou entrar de novo).
 * Não mostra nenhum detalhe técnico (endereço, consulta, servidor) para quem vê.
 */
export function ErrorScreen({
  code,
  onRetry,
  onSignIn,
  fullScreen = true,
  testID = 'error-screen',
}: {
  code: ErrorScreenCode;
  /** "Tentar de novo" (429, 500, 503 e 504). Sem ele, o botão recarrega a tela. */
  onRetry?: () => unknown;
  /** 401: entrar de novo (sai da sessão vencida e vai para a entrada). */
  onSignIn?: () => unknown;
  /** false: dentro de uma tela que já tem cabeçalho (perfil, post). */
  fullScreen?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => unknown) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const home = () => router.replace('/');
  const canRetry = code === 429 || code >= 500;

  return (
    <View
      testID={testID}
      style={[styles.screen, fullScreen && { flex: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
      accessibilityLiveRegion="polite"
    >
      {fullScreen ? (
        <Head>
          <title>{`${code} · ${t(`errorPages.${code}.title`)} · Soundhora`}</title>
        </Head>
      ) : null}
      <View style={styles.badge}>
        <Ionicons name={ICON[code]} size={34} color={colors.text} />
      </View>
      <Text style={styles.code} accessibilityLabel={t('errorPages.codeLabel', { code })}>
        {code}
      </Text>
      <Text style={styles.title} accessibilityRole="header">
        {t(`errorPages.${code}.title`)}
      </Text>
      <Text style={styles.body}>{t(`errorPages.${code}.body`)}</Text>

      <View style={styles.actions}>
        {code === 401 ? (
          <Button testID={`${testID}-signin`} title={t('errorPages.signIn')} onPress={() => void run(onSignIn ?? home)} loading={busy} />
        ) : canRetry ? (
          <Button testID={`${testID}-retry`} title={t('common.retry')} onPress={() => void run(onRetry ?? home)} loading={busy} />
        ) : (
          <Button testID={`${testID}-home`} title={t('errorPages.home')} onPress={home} />
        )}
        {code !== 401 && (canRetry || router.canGoBack?.()) ? (
          <Button
            testID={`${testID}-secondary`}
            variant="ghost"
            title={canRetry ? t('errorPages.home') : t('common.back')}
            onPress={canRetry ? home : () => router.back()}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
    gap: space.sm,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: space.sm,
  },
  code: { fontFamily: fonts.bold, fontSize: 64, lineHeight: 72, color: colors.muted, letterSpacing: 2 },
  title: { ...text.title, textAlign: 'center' },
  body: { ...text.body, color: colors.textMuted, textAlign: 'center', maxWidth: 360 },
  actions: { marginTop: space.lg, gap: space.sm, alignSelf: 'stretch', maxWidth: 320, width: '100%', marginHorizontal: 'auto' },
});
