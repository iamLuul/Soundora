import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SignInForm, SignUpForm, useDescribeError } from '../components/auth/AuthForms';
import { Button, ErrorText, Screen, SegmentedControl } from '../components/ui';
import { signInWithProvider } from '../lib/auth';
import { colors, fonts, space, text } from '../theme';

type Tab = 'signIn' | 'signUp';

export default function SignIn() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('signIn');
  // E-mail que precisa confirmar o código de cadastro (vindo do login com conta não confirmada).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const describe = useDescribeError();
  const [error, setError] = useState<string | null>(null);

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(describe(err));
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Soundora.</Text>
        <Text style={text.title}>{t('auth.welcome')}</Text>
        <Text style={[text.body, { color: colors.textMuted }]}>{t('auth.tagline')}</Text>
      </View>

      <SegmentedControl<Tab>
        value={tab}
        onChange={(v) => {
          setTab(v);
          setError(null);
          setPendingEmail(null);
        }}
        options={[
          { value: 'signIn', label: t('auth.tabSignIn') },
          { value: 'signUp', label: t('auth.tabSignUp') },
        ]}
      />

      {tab === 'signIn' ? (
        <SignInForm
          onUnconfirmed={(email) => {
            setPendingEmail(email);
            setTab('signUp');
          }}
        />
      ) : (
        <SignUpForm key={pendingEmail ?? 'new'} confirmEmail={pendingEmail} />
      )}

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={text.small}>{t('common.or')}</Text>
        <View style={styles.line} />
      </View>

      <ErrorText>{error}</ErrorText>
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
