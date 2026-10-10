import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SettingsRow, SettingsSection } from '../../components/Settings';
import { Screen, SegmentedControl } from '../../components/ui';
import { updateLocale } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { space, text } from '../../theme';

type Locale = 'pt-BR' | 'en';

/** Configurações (menu ⋮ do perfil): conta, preferências e sair. Novas opções entram aqui. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { profile, session, signOut } = useAuth();
  if (!profile) return null;

  const changeLanguage = async (locale: Locale) => {
    await i18n.changeLanguage(locale);
    await updateLocale(locale).catch(() => undefined);
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: space.xl }}>
      <Stack.Screen options={{ title: t('settings.title') }} />

      <SettingsSection title={t('settings.account')}>
        <SettingsRow testID="settings-edit-profile" icon="create-outline" label={t('profile.edit')} value={t('settings.editProfileHint')} onPress={() => router.push('/settings/profile')} />
        <SettingsRow testID="settings-username" icon="at" label={t('settings.username')} value={`@${profile.username}`} onPress={() => router.push('/settings/username')} />
        <SettingsRow
          testID="settings-password"
          icon="key-outline"
          label={t('settings.password')}
          value={session?.user.email ?? undefined}
          onPress={() => router.push('/settings/password')}
          last
        />
      </SettingsSection>

      <SettingsSection title={t('settings.preferences')}>
        <SettingsRow icon="language-outline" label={t('profile.language')} last />
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, marginTop: -space.sm }}>
          <SegmentedControl<Locale>
            value={i18n.language === 'en' ? 'en' : 'pt-BR'}
            onChange={changeLanguage}
            options={[
              { value: 'pt-BR', label: 'Português' },
              { value: 'en', label: 'English' },
            ]}
          />
        </View>
      </SettingsSection>

      <SettingsSection title={t('settings.session')}>
        <SettingsRow testID="settings-sign-out" icon="log-out-outline" label={t('profile.signOut')} onPress={signOut} />
        <SettingsRow testID="settings-delete" icon="trash-outline" label={t('settings.deleteAccount')} danger onPress={() => router.push('/settings/delete-account')} last />
      </SettingsSection>

      <Text style={[text.small, { textAlign: 'center' }]}>Soundora {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}
