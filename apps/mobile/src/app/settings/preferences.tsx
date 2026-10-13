import { PLATFORM_LABELS } from '@soundora/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChoiceRow, SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { updateLocale } from '../../lib/api';
import { useStreamingPlatform } from '../../lib/queries';

type Locale = 'pt-BR' | 'en';

/** Configurações › Preferências: idioma e plataforma de streaming. */
export default function PreferencesSettingsScreen() {
  const { t, i18n } = useTranslation();
  const platform = useStreamingPlatform();
  const current: Locale = i18n.language === 'en' ? 'en' : 'pt-BR';

  const changeLanguage = async (locale: Locale) => {
    await i18n.changeLanguage(locale);
    await updateLocale(locale).catch(() => undefined);
  };

  return (
    <SettingsScreen title={t('settings.catPreferences')}>
      <SettingsSection title={t('profile.language')}>
        <ChoiceRow testID="language-pt-BR" label="Português" selected={current === 'pt-BR'} onPress={() => changeLanguage('pt-BR')} />
        <ChoiceRow testID="language-en" label="English" selected={current === 'en'} onPress={() => changeLanguage('en')} last />
      </SettingsSection>
      <SettingsSection>
        <SettingsRow
          testID="settings-streaming"
          icon="musical-notes-outline"
          label={t('settings.streaming')}
          value={platform.data ? PLATFORM_LABELS[platform.data] : t('settings.streamingNone')}
          onPress={() => router.push('/settings/streaming')}
          last
        />
      </SettingsSection>
    </SettingsScreen>
  );
}
