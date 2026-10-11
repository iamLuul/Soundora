import { passwordSchema } from '@soundora/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { authErrorKey } from '../../lib/auth-errors';
import {
  isValidEmail,
  parseIdentifier,
  resendSignUpCode,
  sendLoginCode,
  signInWithPassword,
  signUp,
  verifyLoginCode,
  verifySignUpCode,
  type Identifier,
} from '../../lib/auth-flows';
import { errorDetail } from '../../lib/errors';
import { supabaseUrl } from '../../lib/supabase';
import { colors, fonts, space, text } from '../../theme';
import { Button, ErrorText, TextField } from '../ui';
import { CodeStep } from './CodeStep';
import { PasswordField } from './PasswordField';

/** Mensagem para a pessoa; em desenvolvimento, inclui o erro técnico para facilitar o diagnóstico. */
export function useDescribeError() {
  const { t } = useTranslation();
  return (err: unknown): string => {
    console.error('[Soundora] erro no login:', err);
    const base = t(authErrorKey(err));
    if (!__DEV__) return base;
    const detail = errorDetail(err) || (err instanceof Error ? err.message : String(err));
    return `${base}\n${detail}\n(${supabaseUrl})`;
  };
}

type Method = 'password' | 'code';

/** Entrar: e-mail ou @usuário, com senha ou código por e-mail. */
export function SignInForm({ onUnconfirmed }: { onUnconfirmed: (email: string) => void }) {
  const { t } = useTranslation();
  const describe = useDescribeError();
  const [method, setMethod] = useState<Method>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<{ id: Identifier; destination: string } | null>(null);
  const [busy, setBusy] = useState<null | 'password' | 'send' | 'verify'>(null);
  const [error, setError] = useState<string | null>(null);

  const readIdentifier = (): Identifier | null => {
    const id = parseIdentifier(identifier);
    if (!id) setError(t('auth.invalidIdentifier'));
    return id;
  };

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
      // Com sucesso, o AuthProvider recebe a sessão e o roteador leva ao onboarding ou ao feed.
    } catch (err) {
      setError(describe(err));
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const withPassword = () => {
    const id = readIdentifier();
    if (!id || !password) return;
    run('password', () => signInWithPassword(id, password)).catch(async (err) => {
      // Conta criada mas sem o código confirmado: manda um código novo e abre a confirmação.
      if (id.kind === 'email' && authErrorKey(err) === 'auth.emailNotConfirmed') {
        await resendSignUpCode(id.email).catch(() => {});
        onUnconfirmed(id.email);
      }
    });
  };

  const sendCode = () => {
    const id = readIdentifier();
    if (!id) return;
    run('send', async () => {
      const destination = await sendLoginCode(id);
      setSentTo({ id, destination });
    }).catch(() => {});
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError(null);
    setSentTo(null);
  };

  if (sentTo) {
    return (
      <>
        <CodeStep
          destination={sentTo.destination}
          verifyLabel={t('auth.signIn')}
          backLabel={t('auth.useOtherAccount')}
          verifying={busy === 'verify'}
          onVerify={(code) => run('verify', () => verifyLoginCode(sentTo.id, code)).catch(() => {})}
          onResend={() => run('send', async () => void (await sendLoginCode(sentTo.id)))}
          onBack={() => setSentTo(null)}
        />
        <ErrorText>{error}</ErrorText>
      </>
    );
  }

  return (
    <>
      <TextField
        testID="identifier-input"
        label={t('auth.identifier')}
        placeholder={t('auth.identifierPlaceholder')}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        keyboardType="email-address"
      />

      {method === 'password' ? (
        <>
          <View>
            <PasswordField testID="password-input" label={t('auth.password')} value={password} onChangeText={setPassword} onSubmitEditing={withPassword} />
            <Text testID="forgot-password" style={styles.forgot} onPress={() => switchMethod('code')} accessibilityRole="link">
              {t('auth.forgot')}
            </Text>
          </View>
          <Button
            testID="sign-in"
            title={t('auth.signIn')}
            onPress={withPassword}
            loading={busy === 'password'}
            disabled={!!busy || !identifier.trim() || !password}
            style={styles.main}
          />
          <Text testID="use-code" style={styles.switch} onPress={() => switchMethod('code')} accessibilityRole="link">
            {t('auth.modeCode')}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('auth.codeHint')}</Text>
          <Button
            testID="send-code"
            title={t('auth.sendCode')}
            onPress={sendCode}
            loading={busy === 'send'}
            disabled={!!busy || !identifier.trim()}
            style={styles.main}
          />
          <Text testID="use-password" style={styles.switch} onPress={() => switchMethod('password')} accessibilityRole="link">
            {t('auth.modePassword')}
          </Text>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

/** Criar conta: e-mail, senha e confirmação → código de 6 dígitos no e-mail. */
export function SignUpForm({ confirmEmail }: { confirmEmail: string | null }) {
  const { t, i18n } = useTranslation();
  const describe = useDescribeError();
  const [email, setEmail] = useState(confirmEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [verifyFor, setVerifyFor] = useState<string | null>(confirmEmail);
  const [busy, setBusy] = useState<null | 'create' | 'verify'>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});

  const create = async () => {
    const value = email.trim().toLowerCase();
    const errors: typeof fieldErrors = {};
    if (!isValidEmail(value)) errors.email = t('auth.invalidEmail');
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) errors.password = t(`errors.${pw.error.issues[0]?.message ?? 'password_too_short'}`);
    else if (confirm !== password) errors.confirm = t('errors.passwords_differ');
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length) return;

    setBusy('create');
    try {
      const result = await signUp(value, password, i18n.language);
      if (result === 'verify') setVerifyFor(value);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (code: string) => {
    if (!verifyFor) return;
    setBusy('verify');
    setError(null);
    try {
      await verifySignUpCode(verifyFor, code); // a sessão chega e o roteador abre o onboarding
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(null);
    }
  };

  if (verifyFor) {
    return (
      <>
        {confirmEmail ? <Text style={[text.small, styles.center]}>{t('auth.emailNotConfirmed')}</Text> : null}
        <CodeStep
          destination={verifyFor}
          verifyLabel={t('auth.confirm')}
          backLabel={t('auth.changeEmail')}
          verifying={busy === 'verify'}
          onVerify={verify}
          onResend={async () => {
            setError(null);
            try {
              await resendSignUpCode(verifyFor);
            } catch (err) {
              setError(describe(err));
              throw err;
            }
          }}
          onBack={() => {
            setVerifyFor(null);
            setError(null);
          }}
        />
        <ErrorText>{error}</ErrorText>
      </>
    );
  }

  return (
    <>
      <TextField
        testID="email-input"
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
      />
      <PasswordField
        testID="new-password-input"
        label={t('auth.password')}
        hint={t('auth.passwordHint')}
        error={fieldErrors.password}
        value={password}
        onChangeText={setPassword}
        newPassword
      />
      <PasswordField
        testID="confirm-password-input"
        label={t('auth.confirmPassword')}
        error={fieldErrors.confirm}
        value={confirm}
        onChangeText={setConfirm}
        onSubmitEditing={create}
        newPassword
      />
      <Text style={styles.hint}>{t('auth.signUpHint')}</Text>
      <Button testID="sign-up" title={t('common.next')} size="sm" onPress={create} loading={busy === 'create'} disabled={!!busy} />
      <ErrorText>{error}</ErrorText>
    </>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  // Figma: "Esqueci a senha" pequeno, à direita, logo abaixo do campo de senha.
  forgot: { alignSelf: 'flex-end', marginTop: space.sm, marginRight: space.xs, fontFamily: fonts.regular, fontSize: 12, color: colors.text, textDecorationLine: 'underline' },
  // Figma: botão "Entrar" de 246 × 48, centralizado.
  main: { alignSelf: 'center', width: 246, maxWidth: '100%' },
  switch: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginLeft: 14 },
});
