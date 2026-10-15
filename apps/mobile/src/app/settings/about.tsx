import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';

/** Configurações › Sobre: textos legais e versão. */
export default function AboutSettingsScreen() {
  const { t } = useTranslation();
  return (
    <SettingsScreen title={t('settings.catAbout')}>
      <SettingsSection>
        <SettingsRow testID="settings-terms" icon="document-text-outline" label={t('legal.terms')} onPress={() => router.push('/legal/terms')} />
        <SettingsRow testID="settings-privacy-policy" icon="lock-closed-outline" label={t('legal.privacy')} onPress={() => router.push('/legal/privacy')} />
        <SettingsRow testID="settings-guardians" icon="people-outline" label={t('legal.guardians')} onPress={() => router.push('/legal/guardians')} />
        <SettingsRow testID="settings-cookies" icon="browsers-outline" label={t('legal.cookies')} onPress={() => router.push('/legal/cookies')} />
        <SettingsRow testID="settings-ads" icon="megaphone-outline" label={t('legal.ads')} onPress={() => router.push('/legal/ads')} last />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon="code-slash-outline" label={t('settings.version')} value={`Soundhora ${Constants.expoConfig?.version ?? ''}`} last />
      </SettingsSection>
    </SettingsScreen>
  );
}
