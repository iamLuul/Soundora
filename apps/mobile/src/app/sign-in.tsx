import { Ionicons } from '@expo/vector-icons';
import { passwordSchema } from '@soundora/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, ErrorText, Screen, SegmentedControl, TextField } from '../components/ui';
import { signInWithProvider } from '../lib/auth';
import { authErrorKey } from '../lib/auth-errors';
import { supabase, supabaseUrl } from '../lib/supabase';
import { colors, fonts, space, text } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'password' | 'code';

export default function SignIn() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<null | 'signIn' | 'signUp' | 'code' | 'verify'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Mensagem para a pessoa; em desenvolvimento, inclui o erro técnico para facilitar o diagnóstico. */
  const describeError = (err: unknown): string => {
    console.error('[Soundora] erro no login:', err);
    const base = t(authErrorKey(err));
    if (!__DEV__) return base;
    const detail = err instanceof Error ? err.message : String(err);
    return `${base}\n${detail}\n(${supabaseUrl})`;
  };

  const cleanEmail = () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError(t('auth.invalidEmail'));
      return null;
    }
    return value;
  };

  const start = (kind: NonNullable<typeof busy>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
  };

  const signIn = async () => {
    const value = cleanEmail();
    if (!value || !password) return;
    start('signIn');
    const { error: err } = await supabase.auth.signInWithPassword({ email: value, password });
    setBusy(null);
    if (err) setError(describeError(err));
    // Com sucesso, o AuthProvider recebe a sessão e o roteador leva ao onboarding ou ao feed.
  };

  const signUp = async () => {
    const value = cleanEmail();
    if (!value) return;
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setError(t(`errors.${pw.error.issues[0]?.message ?? 'password_too_short'}`));
    start('signUp');
    const { data, error: err } = await supabase.auth.signUp({ email: value, password, options: { data: { locale: i18n.language } } });
    setBusy(null);
    if (err) return setError(describeError(err));
    // Com "confirmar e-mail" ligado (padrão na nuvem), a conta nasce sem sessão.
    if (!data.session) setNotice(t('auth.confirmEmail'));
  };

  const sendCode = async () => {
    const value = cleanEmail();
    if (!value) return;
    start('code');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: value,
      options: { shouldCreateUser: true, data: { locale: i18n.language } },
    });
    setBusy(null);
    if (err) return setError(describeError(err));
    setSent(true);
  };

  const verify = async () => {
    start('verify');
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(null);
    if (err) setError(describeError(err));
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setSent(false);
    setCode('');
  };

  return (
    <Screen scroll style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Soundora.</Text>
        <Text style={text.title}>{t('auth.welcome')}</Text>
        <Text style={[text.body, { color: colors.textMuted }]}>{t('auth.tagline')}</Text>
      </View>

      <SegmentedControl<Mode>
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'password', label: t('auth.modePassword') },
          { value: 'code', label: t('auth.modeCode') },
        ]}
      />

      <TextField
        testID="email-input"
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        editable={!sent}
      />

      {mode === 'password' ? (
        <>
          <View>
            <TextField
              testID="password-input"
              label={t('auth.password')}
              hint={t('auth.passwordHint')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={signIn}
            />
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={20}
              color={colors.muted}
              style={styles.eye}
              onPress={() => setShowPassword((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            />
          </View>
          <Button testID="sign-in" title={t('auth.signIn')} onPress={signIn} loading={busy === 'signIn'} disabled={!!busy || !password} />
          <Button testID="sign-up" title={t('auth.signUp')} variant="ghost" onPress={signUp} loading={busy === 'signUp'} disabled={!!busy} />
          <Text style={[text.small, styles.link]} onPress={() => switchMode('code')} accessibilityRole="link">
            {t('auth.forgot')}
          </Text>
        </>
      ) : !sent ? (
        <>
          <Text style={text.small}>{t('auth.codeHint')}</Text>
          <Button testID="send-code" title={t('auth.sendCode')} onPress={sendCode} loading={busy === 'code'} disabled={!!busy} />
        </>
      ) : (
        <>
          <Text style={text.body}>{t('auth.codeSentTo', { email: email.trim() })}</Text>
          <TextField
            testID="code-input"
            label={t('auth.code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            onSubmitEditing={verify}
          />
          <Button testID="verify-code" title={t('auth.verify')} onPress={verify} loading={busy === 'verify'} disabled={code.length !== 6} />
          <Button title={t('auth.resend')} variant="ghost" onPress={sendCode} disabled={!!busy} />
        </>
      )}

      <ErrorText>{error}</ErrorText>
      {notice ? <Text style={[text.body, { color: colors.success }]}>{notice}</Text> : null}

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={text.small}>{t('common.or')}</Text>
        <View style={styles.line} />
      </View>

      <Button
        title={t('auth.google')}
        variant="secondary"
        icon={<Ionicons name="logo-google" size={18} color={colors.background} />}
        onPress={() => social('google')}
      />
      {Platform.OS !== 'android' ? (
        <Button
          title={t('auth.apple')}
          variant="secondary"
          icon={<Ionicons name="logo-apple" size={18} color={colors.background} />}
          onPress={() => social('apple')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  logo: { fontFamily: fonts.bold, fontSize: 32, color: colors.muted },
  eye: { position: 'absolute', right: space.md, top: 34, padding: 4 },
  link: { textAlign: 'center', textDecorationLine: 'underline' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
