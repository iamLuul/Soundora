import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '../../components/ErrorState';
import { OptionsSheet } from '../../components/OptionsSheet';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { showToast } from '../../components/Toast';
import { fetchMyAccount, setGender, type Gender } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { colors, fonts, glass, space } from '../../theme';

export const myAccountKey = ['my-account'] as const;
const GENDERS: Gender[] = ['female', 'male', 'non_binary', 'other'];

/** Data no idioma do app, sem fuso (datas de nascimento são só dia/mês/ano). */
function formatDate(value: string, locale: string, dateOnly = false) {
  const d = dateOnly ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: dateOnly ? 'UTC' : undefined });
}

/** Configurações › Sua conta: perfil, @, e-mail, criação da conta, gênero, nascimento e idade. */
export default function AccountSettingsScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { profile, session } = useAuth();
  const account = useQuery({ queryKey: myAccountKey, queryFn: fetchMyAccount });
  const [genderOpen, setGenderOpen] = useState(false);
  if (!profile) return null;

  const a = account.data;
  const genderLabel = (g: Gender | null) => (g ? t(`settings.gender_${g}`) : t('settings.genderNone'));
  const chooseGender = async (g: Gender | null) => {
    setGenderOpen(false);
    try {
      await setGender(g);
      qc.setQueryData(myAccountKey, (old: typeof a) => (old ? { ...old, gender: g } : old));
      showToast(t('toast.saved'));
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <SettingsScreen title={t('settings.catAccount')}>
      <SettingsSection>
        <SettingsRow
          testID="settings-edit-profile"
          icon="create-outline"
          label={t('profile.edit')}
          value={t('settings.editProfileHint')}
          onPress={() => router.push('/settings/profile')}
        />
        <SettingsRow
          testID="settings-username"
          icon="at"
          label={t('settings.username')}
          value={`@${profile.username}`}
          onPress={() => router.push('/settings/username')}
          last
        />
      </SettingsSection>

      <SettingsSection note={t('settings.personalNote')}>
        <SettingsRow testID="settings-email" icon="mail-outline" label={t('settings.email')} value={session?.user.email || t('settings.emailNone')} />
        {account.isError ? (
          <ErrorState message={formatError(t, account.error)} onRetry={() => account.refetch()} />
        ) : (
          <>
            <SettingsRow
              testID="settings-created"
              icon="calendar-outline"
              label={t('settings.createdAt')}
              value={a ? formatDate(a.created_at, i18n.language) : '…'}
            />
            <SettingsRow
              testID="settings-gender"
              icon="person-circle-outline"
              label={t('settings.gender')}
              value={a ? genderLabel(a.gender) : '…'}
              onPress={a ? () => setGenderOpen(true) : undefined}
            />
            <SettingsRow
              testID="settings-birthdate"
              icon="gift-outline"
              label={t('settings.birthdate')}
              value={a ? formatDate(a.birthdate, i18n.language, true) : '…'}
            />
            <SettingsRow
              testID="settings-age"
              icon="hourglass-outline"
              label={t('settings.age')}
              value={a ? t('settings.ageValue', { count: a.age }) : '…'}
              last
            />
          </>
        )}
      </SettingsSection>

      {/* Menor de idade: o que vale para a conta (Termo de responsáveis). */}
      {a && a.age < 18 ? (
        <View testID="settings-minor" style={styles.minor} accessible accessibilityRole="summary">
          <View style={styles.minorHead}>
            <Ionicons name="people-outline" size={20} color={colors.text} />
            <Text style={styles.minorTitle}>{t('settings.minorTitle')}</Text>
          </View>
          <Text style={styles.minorBody}>{t('settings.minorBody')}</Text>
          <Pressable testID="settings-minor-terms" accessibilityRole="link" onPress={() => router.push('/legal/guardians')}>
            <Text style={styles.link}>{t('settings.minorLink')}</Text>
          </Pressable>
        </View>
      ) : null}

      <OptionsSheet
        visible={genderOpen}
        title={t('settings.gender')}
        onClose={() => setGenderOpen(false)}
        options={[
          ...GENDERS.map((g) => ({
            key: `gender-${g}`,
            label: genderLabel(g),
            icon: (a?.gender === g ? 'radio-button-on' : 'radio-button-off') as 'radio-button-on',
            onPress: () => chooseGender(g),
          })),
          {
            key: 'gender-none',
            label: t('settings.genderNone'),
            icon: (a?.gender == null ? 'radio-button-on' : 'radio-button-off') as 'radio-button-on',
            onPress: () => chooseGender(null),
          },
        ]}
      />
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  minor: { ...glass.card, borderRadius: 18, padding: space.lg, gap: space.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  minorHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  minorTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  minorBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.text },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
});
