import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { SupportRow, useSupportUrl } from '../../components/SupportLink';
import { APP_VERSION_LABEL } from '../../lib/version';

/** Configurações › Sobre: apoio (só na Web), textos legais e versão. */
export default function AboutSettingsScreen() {
  const { t } = useTranslation();
  const supportUrl = useSupportUrl();
  return (
    <SettingsScreen title={t('settings.catAbout')}>
      {/* Só na Web, e só com o link configurado. */}
      {supportUrl ? (
        <SettingsSection>
          <SupportRow />
        </SettingsSection>
      ) : null}
      <SettingsSection>
        <SettingsRow testID="settings-terms" icon="document-text-outline" label={t('legal.terms')} onPress={() => router.push('/legal/terms')} />
        <SettingsRow testID="settings-privacy-policy" icon="lock-closed-outline" label={t('legal.privacy')} onPress={() => router.push('/legal/privacy')} />
        <SettingsRow testID="settings-guardians" icon="people-outline" label={t('legal.guardians')} onPress={() => router.push('/legal/guardians')} />
        <SettingsRow testID="settings-cookies" icon="browsers-outline" label={t('legal.cookies')} onPress={() => router.push('/legal/cookies')} />
        <SettingsRow testID="settings-ads" icon="megaphone-outline" label={t('legal.ads')} onPress={() => router.push('/legal/ads')} last />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon="code-slash-outline" label={t('settings.version')} value={`Soundhora ${APP_VERSION_LABEL}`} last />
      </SettingsSection>
    </SettingsScreen>
  );
}
