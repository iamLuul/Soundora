import { checkAge, displayNameSchema, MIN_GENRES, passwordSchema, usernameSchema, type AgePolicy, type StreamingChoice } from '@soundora/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PasswordField } from '../components/auth/PasswordField';
import { BackHeader } from '../components/figma';
import { GenrePicker } from '../components/GenrePicker';
import { StreamingPicker } from '../components/StreamingPicker';
import { Button, ErrorText, Screen, TextField } from '../components/ui';
import { checkUsernameAvailable, completeOnboarding, getAppConfig } from '../lib/api';
import { toIsoDate } from '../lib/date';
import { accountGone, useAuth } from '../lib/auth';
import { setPassword as savePassword } from '../lib/auth-flows';
import { errorMessageKey, formatError } from '../lib/errors';
import { useGenres } from '../lib/queries';
import { useUsernameStatus, validateUsernameFormat } from '../lib/username';
import { colors, fonts, space, text } from '../theme';

type Step = 'password' | 'profile' | 'birthdate' | 'genres' | 'platform' | 'terms';

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const { refreshProfile, session, signOut } = useAuth();
  // Quem entrou com Google ou Apple ainda não tem senha: cria aqui, para poder entrar também
  // com e-mail/@usuário e senha. Quem criou a conta pelo e-mail já definiu a senha no cadastro.
  const provider = session?.user.app_metadata?.provider;
  const [needsPassword] = useState(() => !!provider && provider !== 'email');
  const steps: Step[] = needsPassword ? ['password', 'profile', 'birthdate', 'genres', 'platform', 'terms'] : ['profile', 'birthdate', 'genres', 'platform', 'terms'];
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [platform, setPlatform] = useState<StreamingChoice | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [checkingNext, setCheckingNext] = useState(false);
  const usernameStatus = useUsernameStatus(username);

  const config = useQuery({ queryKey: ['app-config'], queryFn: getAppConfig });
  const genreList = useGenres();

  const policy: AgePolicy | null = config.data
    ? { minAge: config.data.min_age, guardianRequiredUnder: config.data.guardian_required_under, guardianFlowEnabled: config.data.guardian_flow_enabled }
    : null;

  const next = async () => {
    setError(null);
    if (step === 'password') {
      const pw = passwordSchema.safeParse(password);
      if (!pw.success) return setError(t(`errors.${pw.error.issues[0]?.message ?? 'password_too_short'}`));
      if (confirm !== password) return setError(t('errors.passwords_differ'));
      setCheckingNext(true);
      try {
        // Voltar e avançar de novo não regrava a mesma senha (o Supabase recusaria).
        if (savedPassword !== password) await savePassword(password);
        setSavedPassword(password);
      } catch (err) {
        return setError(formatError(t, err));
      } finally {
        setCheckingNext(false);
      }
    }
    if (step === 'profile') {
      const format = validateUsernameFormat(username);
      if (!format.ok) return setError(t(`errors.${format.reason}`));
      const d = displayNameSchema.safeParse(displayName);
      if (!d.success) return setError(t(`errors.${d.error.issues[0]?.message ?? 'generic'}`));
      // Confere de novo no banco na hora de avançar (alguém pode ter pego o nome nesse meio-tempo).
      setCheckingNext(true);
      try {
        if (!(await checkUsernameAvailable(format.username))) return setError(t('errors.username_taken'));
      } catch (err) {
        return setError(formatError(t, err));
      } finally {
        setCheckingNext(false);
      }
    }
    if (step === 'birthdate') {
      if (!policy) return setError(t('common.error'));
      const result = checkAge(toIsoDate(day, month, year), policy);
      if (result.status === 'invalid') return setError(t('age.invalid'));
      if (result.status === 'too_young') return setError(t('age.too_young', { min: policy.minAge }));
      if (result.status === 'needs_guardian') return setError(t('age.needs_guardian', { under: policy.guardianRequiredUnder }));
    }
    if (step === 'genres' && genres.length < MIN_GENRES) return setError(t('errors.genres_too_few'));
    if (step === 'platform' && !platform) return setError(t('streaming.required'));
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding({
        username: usernameSchema.parse(username),
        displayName: displayName.trim(),
        birthdate: toIsoDate(day, month, year),
        genres,
        locale: i18n.language === 'pt-BR' ? 'pt-BR' : 'en',
        streamingPlatform: platform!,
      });
      await refreshProfile(); // o roteador troca para o feed sozinho
    } catch (err) {
      const key = errorMessageKey(err);
      // Sessão de uma conta que não existe mais no servidor: volta para o login.
      if (key === 'errors.generic' && (await accountGone())) {
        await signOut();
        return;
      }
      setError(formatError(t, err, { min: policy?.minAge, under: policy?.guardianRequiredUnder }));
      if (key === 'errors.username_taken') setIndex(steps.indexOf('profile'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      {index > 0 ? <BackHeader onBack={() => setIndex((i) => i - 1)} /> : <View style={styles.headerSpace} />}
      {/* Figma: pontos no topo marcam o passo (o atual é o longo, em roxo). */}
      <View style={styles.dots} accessible accessibilityRole="progressbar" accessibilityLabel={t('onboarding.step', { current: index + 1, total: steps.length })}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.dot, i === index && styles.dotActive, i < index && styles.dotDone]} />
        ))}
      </View>

      {step === 'password' && (
        <>
          <Text style={styles.title}>{t('onboarding.passwordTitle')}</Text>
          <Text style={styles.hint}>{t('onboarding.passwordHint')}</Text>
          <PasswordField testID="new-password-input" label={t('auth.password')} hint={t('auth.passwordHint')} value={password} onChangeText={setPassword} newPassword />
          <PasswordField testID="confirm-password-input" label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} newPassword />
        </>
      )}

      {step === 'profile' && (
        <>
          <Text style={styles.title}>{t('onboarding.profileTitle')}</Text>
          <TextField
            testID="username-input"
            label={t('onboarding.username')}
            hint={usernameStatus.state === 'checking' ? t('onboarding.usernameChecking') : t('onboarding.usernameHint')}
            error={
              usernameStatus.state === 'invalid'
                ? t(`errors.${usernameStatus.reason}`)
                : usernameStatus.state === 'taken'
                  ? t('errors.username_taken')
                  : usernameStatus.state === 'error'
                    ? usernameStatus.message
                    : null
            }
            success={usernameStatus.state === 'available' ? t('onboarding.usernameAvailable', { username: usernameStatus.username }) : null}
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="@"
          />
          <TextField testID="display-name-input" label={t('onboarding.displayName')} value={displayName} onChangeText={setDisplayName} />
        </>
      )}

      {step === 'birthdate' && (
        <>
          <Text style={styles.title}>{t('onboarding.birthdateTitle')}</Text>
          <Text style={styles.hint}>{t('onboarding.birthdateHint')}</Text>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <TextField label={t('onboarding.day')} value={day} onChangeText={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="DD" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label={t('onboarding.month')} value={month} onChangeText={(v) => setMonth(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="MM" />
            </View>
            <View style={{ flex: 1.4 }}>
              <TextField label={t('onboarding.year')} value={year} onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="AAAA" />
            </View>
          </View>
        </>
      )}

      {step === 'genres' && (
        <>
          <Text style={styles.title}>{t('onboarding.genresTitle')}</Text>
          <Text style={styles.hint}>{t('onboarding.genresHint', { min: MIN_GENRES })}</Text>
          {/* Milhares de gêneros: pesquisa no catálogo; os de destaque já aparecem para tocar. */}
          <GenrePicker
            title={null}
            value={genres}
            onChange={setGenres}
            max={10}
            suggestions={(genreList.data ?? []).map((g) => g.slug)}
            quickLimit={100}
          />
        </>
      )}

      {step === 'platform' && (
        <>
          <Text style={styles.title}>{t('streaming.title')}</Text>
          <Text style={styles.hint}>{t('streaming.hint')}</Text>
          <StreamingPicker value={platform} onChange={setPlatform} />
        </>
      )}

      {step === 'terms' && (
        <>
          <Text style={styles.title}>{t('onboarding.termsTitle')}</Text>
          <Text style={text.body}>{t('onboarding.termsBody')}</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => setAccepted((a) => !a)}
            style={styles.checkRow}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxOn]} />
            <Text style={[text.body, { flex: 1 }]}>{t('onboarding.termsAccept')}</Text>
          </Pressable>
        </>
      )}

      <ErrorText>{error}</ErrorText>

      <View style={styles.footer}>
        {step !== 'terms' ? (
          <Button
            testID="onboarding-next"
            size="sm"
            title={t('common.next')}
            onPress={next}
            loading={checkingNext}
            disabled={step === 'profile' && (usernameStatus.state === 'taken' || usernameStatus.state === 'invalid')}
          />
        ) : (
          <Button testID="onboarding-finish" size="sm" title={t('onboarding.finish')} onPress={finish} disabled={!accepted} loading={busy} />
        )}
      </View>

      {/* Sempre há saída: dá para trocar de conta no meio do onboarding. */}
      <Text testID="onboarding-sign-out" style={styles.signOut} onPress={() => void signOut()} accessibilityRole="button">
        {t('onboarding.signOut')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  headerSpace: { height: 26 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface },
  dotActive: { width: 24, backgroundColor: colors.primary },
  dotDone: { backgroundColor: colors.muted },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  dateRow: { flexDirection: 'row', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.field },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  footer: { alignItems: 'flex-end' },
  signOut: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', textDecorationLine: 'underline', marginTop: space.lg },
});
