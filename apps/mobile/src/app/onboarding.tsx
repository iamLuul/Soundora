import { checkAge, displayNameSchema, MIN_GENRES, usernameSchema, type AgePolicy } from '@soundora/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Chip, ErrorText, Screen, TextField } from '../components/ui';
import { completeOnboarding, getAppConfig } from '../lib/api';
import { toIsoDate } from '../lib/date';
import { useAuth } from '../lib/auth';
import { errorMessageKey } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { colors, space, text } from '../theme';

const TOTAL_STEPS = 4;

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const config = useQuery({ queryKey: ['app-config'], queryFn: getAppConfig });
  const genreList = useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('genres').select('slug, name_pt, name_en').order('name_pt');
      if (err) throw err;
      return data as { slug: string; name_pt: string; name_en: string }[];
    },
  });

  const policy: AgePolicy | null = config.data
    ? { minAge: config.data.min_age, guardianRequiredUnder: config.data.guardian_required_under, guardianFlowEnabled: config.data.guardian_flow_enabled }
    : null;

  const next = () => {
    setError(null);
    if (step === 1) {
      const u = usernameSchema.safeParse(username);
      if (!u.success) return setError(t(`errors.${u.error.issues[0]?.message ?? 'generic'}`));
      const d = displayNameSchema.safeParse(displayName);
      if (!d.success) return setError(t(`errors.${d.error.issues[0]?.message ?? 'generic'}`));
    }
    if (step === 2) {
      if (!policy) return setError(t('common.error'));
      const result = checkAge(toIsoDate(day, month, year), policy);
      if (result.status === 'invalid') return setError(t('age.invalid'));
      if (result.status === 'too_young') return setError(t('age.too_young', { min: policy.minAge }));
      if (result.status === 'needs_guardian') return setError(t('age.needs_guardian', { under: policy.guardianRequiredUnder }));
    }
    if (step === 3 && genres.length < MIN_GENRES) return setError(t('errors.genres_too_few'));
    setStep((s) => s + 1);
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
      });
      await refreshProfile(); // o roteador troca para o feed sozinho
    } catch (err) {
      const key = errorMessageKey(err);
      setError(t(key, { min: policy?.minAge, under: policy?.guardianRequiredUnder }));
      if (key === 'errors.username_taken') setStep(1);
    } finally {
      setBusy(false);
    }
  };

  const toggleGenre = (slug: string) =>
    setGenres((g) => (g.includes(slug) ? g.filter((x) => x !== slug) : g.length >= 10 ? g : [...g, slug]));

  return (
    <Screen scroll style={styles.container}>
      <Text style={text.small}>{t('onboarding.step', { current: step, total: TOTAL_STEPS })}</Text>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>

      {step === 1 && (
        <>
          <Text style={text.title}>{t('onboarding.profileTitle')}</Text>
          <TextField
            testID="username-input"
            label={t('onboarding.username')}
            hint={t('onboarding.usernameHint')}
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="@"
          />
          <TextField testID="display-name-input" label={t('onboarding.displayName')} value={displayName} onChangeText={setDisplayName} />
        </>
      )}

      {step === 2 && (
        <>
          <Text style={text.title}>{t('onboarding.birthdateTitle')}</Text>
          <Text style={text.small}>{t('onboarding.birthdateHint')}</Text>
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

      {step === 3 && (
        <>
          <Text style={text.title}>{t('onboarding.genresTitle')}</Text>
          <Text style={text.small}>{t('onboarding.genresHint', { min: MIN_GENRES })}</Text>
          <View style={styles.chips}>
            {(genreList.data ?? []).map((g) => (
              <Chip key={g.slug} label={i18n.language === 'pt-BR' ? g.name_pt : g.name_en} selected={genres.includes(g.slug)} onPress={() => toggleGenre(g.slug)} />
            ))}
          </View>
        </>
      )}

      {step === 4 && (
        <>
          <Text style={text.title}>{t('onboarding.termsTitle')}</Text>
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
        {step > 1 ? <Button title={t('common.back')} variant="ghost" onPress={() => setStep((s) => s - 1)} /> : <View />}
        {step < TOTAL_STEPS ? (
          <Button testID="onboarding-next" title={t('common.next')} onPress={next} />
        ) : (
          <Button testID="onboarding-finish" title={t('onboarding.finish')} onPress={finish} disabled={!accepted} loading={busy} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.primary },
  dateRow: { flexDirection: 'row', gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.muted },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
});
