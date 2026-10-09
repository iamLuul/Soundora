import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, ErrorText, Screen, TextField } from '../components/ui';
import { signInWithProvider } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, fonts, space, text } from '../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) return setError(t('auth.invalidEmail'));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: value,
      options: { shouldCreateUser: true, data: { locale: i18n.language } },
    });
    setBusy(false);
    if (err) return setError(t('common.error'));
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (err) setError(t('auth.invalidCode'));
    // Com sucesso, o AuthProvider recebe a sessão e o roteador leva ao onboarding ou ao feed.
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Soundora.</Text>
        <Text style={text.title}>{t('auth.welcome')}</Text>
        <Text style={[text.body, { color: colors.textMuted }]}>{t('auth.tagline')}</Text>
      </View>

      {!sent ? (
        <>
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
            onSubmitEditing={sendCode}
          />
          <Button testID="send-code" title={t('auth.sendCode')} onPress={sendCode} loading={busy} />
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
          <Button testID="verify-code" title={t('auth.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} />
          <Button title={t('auth.resend')} variant="ghost" onPress={sendCode} disabled={busy} />
        </>
      )}

      <ErrorText>{error}</ErrorText>

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
  hero: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  logo: { fontFamily: fonts.bold, fontSize: 32, color: colors.muted },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
