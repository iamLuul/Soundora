import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { useIsAdmin } from '../../lib/admin';
import { useAuth } from '../../lib/auth';
import { confirmAction } from '../../lib/dialogs';
import { text } from '../../theme';
import { APP_VERSION } from '../../lib/version';

/** Configurações (menu ⋮ do perfil): uma entrada por categoria, cada uma com a sua tela. */
export default function SettingsScreenIndex() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const admin = useIsAdmin(!!profile);
  if (!profile) return null;

  return (
    <SettingsScreen title={t('settings.title')}>
      <SettingsSection>
        <SettingsRow
          testID="settings-account"
          icon="person-outline"
          label={t('settings.catAccount')}
          value={t('settings.catAccountHint')}
          onPress={() => router.push('/settings/account')}
        />
        <SettingsRow
          testID="settings-security"
          icon="shield-outline"
          label={t('settings.catSecurity')}
          value={t('settings.catSecurityHint')}
          onPress={() => router.push('/settings/security')}
        />
        <SettingsRow
          testID="settings-privacy"
          icon="lock-closed-outline"
          label={t('settings.catPrivacy')}
          value={t('settings.catPrivacyHint')}
          onPress={() => router.push('/settings/privacy')}
        />
        <SettingsRow
          testID="settings-preferences"
          icon="options-outline"
          label={t('settings.catPreferences')}
          value={t('settings.catPreferencesHint')}
          onPress={() => router.push('/settings/preferences')}
        />
        <SettingsRow
          testID="settings-notifications"
          icon="notifications-outline"
          label={t('settings.catNotifications')}
          value={t('settings.catNotificationsHint')}
          onPress={() => router.push('/settings/notifications')}
        />
        <SettingsRow
          testID="settings-accessibility"
          icon="accessibility-outline"
          label={t('settings.catAccessibility')}
          value={t('settings.catAccessibilityHint')}
          onPress={() => router.push('/settings/accessibility')}
        />
        <SettingsRow
          testID="settings-about"
          icon="information-circle-outline"
          label={t('settings.catAbout')}
          value={t('settings.catAboutHint')}
          onPress={() => router.push('/settings/about')}
          last
        />
      </SettingsSection>

      {/* Só para administradores (o banco confere de novo em cada ação do painel). */}
      {admin.data ? (
        <SettingsSection>
          <SettingsRow
            testID="settings-admin"
            icon="shield-checkmark-outline"
            label={t('admin.entry')}
            value={t('admin.entryHint')}
            onPress={() => router.push('/admin')}
            last
          />
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsRow
          testID="settings-sign-out"
          icon="log-out-outline"
          label={t('profile.signOut')}
          onPress={async () => {
            if (await confirmAction(t('confirm.signOut'), t('profile.signOut'), t('common.cancel'))) await signOut();
          }}
        />
        <SettingsRow
          testID="settings-delete"
          icon="trash-outline"
          label={t('settings.deleteAccount')}
          danger
          onPress={() => router.push('/settings/delete-account')}
          last
        />
      </SettingsSection>

      <Text style={[text.small, { textAlign: 'center' }]}>Soundhora {APP_VERSION}</Text>
    </SettingsScreen>
  );
}
