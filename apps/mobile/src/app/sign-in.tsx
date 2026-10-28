import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { appleSvg, googleSvg } from '../assets/brand';
import { SignInForm, SignUpForm, useDescribeError } from '../components/auth/AuthForms';
import { BackHeader, Logo } from '../components/figma';
import { ErrorText, Screen , Avatar } from '../components/ui';
import { signInWithProvider, useAuth } from '../lib/auth';
import { confirmAction } from '../lib/dialogs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Reactive } from '../components/Reactive';
import { Spinner } from '../components/Spinner';
import { colors, fonts, glass, radius, space } from '../theme';

type Mode = 'signIn' | 'signUp';

/** Figma: "Login" e "Sign Up". Uma rota só, para o roteador protegido continuar simples. */
export default function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('signIn');
  // E-mail que precisa confirmar o código de cadastro (vindo do login com conta não confirmada).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const describe = useDescribeError();
  const [error, setError] = useState<string | null>(null);

  const go = (next: Mode, email: string | null = null) => {
    setMode(next);
    setError(null);
    setPendingEmail(email);
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(describe(err));
    }
  };

  if (mode === 'signUp') {
    return (
      <Screen scroll style={[styles.container, styles.top]}>
        <BackHeader onBack={() => go('signIn')} />
        <Text style={styles.title}>{t('auth.signUpTitle')}</Text>
        <SignUpForm key={pendingEmail ?? 'new'} confirmEmail={pendingEmail} />
      </Screen>
    );
  }

  return (
    <Screen scroll style={styles.container}>
      <View style={styles.hero}>
        <Logo height={108} />
        <Text style={styles.title}>{t('auth.welcome')}</Text>
        <Text style={styles.tagline}>{t('auth.tagline')}</Text>
      </View>

      <SavedAccounts onError={(err) => setError(describe(err))} />

      <SignInForm onUnconfirmed={(email) => go('signUp', email)} />

      <View style={styles.divider}>
        <View style={styles.line} />
      </View>

      <View style={styles.signUpRow}>
        <Text style={styles.small}>{t('auth.noAccountYet')}</Text>
        <Pressable
          testID="open-sign-up"
          accessibilityRole="button"
          onPress={() => go('signUp')}
          style={({ pressed }) => [styles.lightButton, styles.signUpButton, pressed && styles.pressed]}
        >
          <Text style={styles.lightText}>{t('auth.signUp')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.small, styles.center]}>{t('common.or')}</Text>

      <ErrorText>{error}</ErrorText>
      <SocialButton testID="sign-in-google" svg={googleSvg} label={t('auth.google')} onPress={() => social('google')} />
      {Platform.OS !== 'android' ? <SocialButton testID="sign-in-apple" svg={appleSvg} label={t('auth.apple')} onPress={() => social('apple')} /> : null}
    </Screen>
  );
}

/**
 * Contas guardadas neste aparelho (de "Adicionar conta" ou de quem trocou de conta): entra com
 * um toque, sem senha. Quem saiu da conta pelo "Sair" não aparece aqui.
 */
function SavedAccounts({ onError }: { onError: (err: unknown) => void }) {
  const { t } = useTranslation();
  const { accounts, signInSaved, forgetSavedAccount } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  if (accounts.length === 0) return null;
  const enter = async (userId: string) => {
    setBusy(userId);
    try {
      await signInSaved(userId);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.saved} testID="saved-accounts">
      <Text style={styles.savedTitle}>{t('accounts.saved')}</Text>
      {accounts.map((a) => (
        <View key={a.userId} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Reactive
            testID={`continue-${a.username}`}
            accessibilityRole="button"
            accessibilityLabel={t('accounts.continueAs', { username: a.username })}
            disabled={!!busy}
            onPress={() => void enter(a.userId)}
            pressScale={0.97}
            hoverScale={1.01}
            style={styles.savedRow}
          >
            <Avatar uri={a.avatarUrl} name={a.displayName} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.savedName} numberOfLines={1}>
                {t('accounts.continueAs', { username: a.username })}
              </Text>
              <Text style={styles.savedHandle} numberOfLines={1}>
                {a.displayName}
              </Text>
            </View>
            {busy === a.userId ? <Spinner size={18} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
          </Reactive>
          <Pressable
            testID={`forget-saved-${a.username}`}
            accessibilityRole="button"
            accessibilityLabel={t('accounts.forget', { username: a.username })}
            onPress={async () => {
              if (await confirmAction(t('accounts.forgetConfirm', { username: a.username }), t('accounts.remove'), t('common.cancel')))
                await forgetSavedAccount(a.userId);
            }}
            hitSlop={8}
            style={{ padding: space.sm }}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** Figma: botão branco de 245 × 48 com a marca à esquerda. */
function SocialButton({ svg, label, onPress, testID }: { svg: string; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.lightButton, styles.social, pressed && styles.pressed]}
    >
      <SvgXml xml={svg} width={22} height={22} />
      <Text style={styles.lightText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center', paddingHorizontal: 30 },
  top: { justifyContent: 'flex-start' },
  hero: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center' },
  tagline: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, textAlign: 'center' },
  divider: { alignItems: 'center' },
  line: { width: 246, maxWidth: '100%', height: 1, backgroundColor: colors.field, opacity: 0.4 },
  signUpRow: { alignItems: 'center', gap: space.sm },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  center: { textAlign: 'center' },
  lightButton: {
    backgroundColor: colors.text,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'center',
  },
  signUpButton: { width: 185, height: 36 },
  social: { width: 245, maxWidth: '100%', height: 48 },
  lightText: { fontFamily: fonts.regular, fontSize: 12, color: colors.background },
  pressed: { opacity: 0.8 },
  saved: { gap: space.xs },
  savedTitle: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, marginLeft: space.xs },
  savedRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    paddingRight: space.md,
    borderRadius: radius.lg,
    ...glass.card,
  },
  savedName: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  savedHandle: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
