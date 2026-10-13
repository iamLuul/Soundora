import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { useAuth } from '../../lib/auth';

/** Configurações › Segurança: senha e contas conectadas. */
export default function SecuritySettingsScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  return (
    <SettingsScreen title={t('settings.catSecurity')}>
      <SettingsSection>
        <SettingsRow
          testID="settings-password"
          icon="key-outline"
          label={t('settings.password')}
          value={session?.user.email ?? undefined}
          onPress={() => router.push('/settings/password')}
        />
        <SettingsRow
          testID="settings-connected"
          icon="link-outline"
          label={t('settings.connected')}
          value={t('settings.connectedHint')}
          onPress={() => router.push('/settings/connected')}
          last
        />
      </SettingsSection>
    </SettingsScreen>
  );
}
