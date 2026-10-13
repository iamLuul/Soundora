import { PLATFORM_LABELS } from '@soundora/core';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { SettingsRow, SettingsSection } from '../../components/Settings';
import { Screen, SegmentedControl } from '../../components/ui';
import { updateLocale } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatError } from '../../lib/errors';
import { useStreamingPlatform } from '../../lib/queries';
import { useIsAdmin } from '../../lib/admin';
import { disablePush, enablePush, pushAvailability, pushEnabled } from '../../lib/push';
import { colors, space, text } from '../../theme';

type Locale = 'pt-BR' | 'en';

/** Configurações (menu ⋮ do perfil): conta, preferências e sair. Novas opções entram aqui. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { profile, session, signOut } = useAuth();
  const admin = useIsAdmin(!!profile);
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
        />
        <SettingsRow
          testID="settings-blocked"
          icon="ban-outline"
          label={t('settings.blocked')}
          value={t('settings.blockedHint')}
          onPress={() => router.push('/settings/blocked')}
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
        <StreamingRow />
        <PushRow />
      </SettingsSection>

      {/* Só para administradores (o banco confere de novo em cada ação do painel). */}
      {admin.data ? (
        <SettingsSection title={t('admin.title')}>
          <SettingsRow testID="settings-admin" icon="shield-checkmark-outline" label={t('admin.entry')} value={t('admin.entryHint')} onPress={() => router.push('/admin')} last />
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('legal.about')}>
        <SettingsRow testID="settings-terms" icon="document-text-outline" label={t('legal.terms')} onPress={() => router.push('/legal/terms')} />
        <SettingsRow testID="settings-privacy" icon="lock-closed-outline" label={t('legal.privacy')} onPress={() => router.push('/legal/privacy')} last />
      </SettingsSection>

      <SettingsSection title={t('settings.session')}>
        <SettingsRow testID="settings-sign-out" icon="log-out-outline" label={t('profile.signOut')} onPress={signOut} />
        <SettingsRow testID="settings-delete" icon="trash-outline" label={t('settings.deleteAccount')} danger onPress={() => router.push('/settings/delete-account')} last />
      </SettingsSection>

      <Text style={[text.small, { textAlign: 'center' }]}>Soundora {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

/** Plataforma de streaming: as músicas do Trending abrem nela. */
function StreamingRow() {
  const { t } = useTranslation();
  const platform = useStreamingPlatform();
  return (
    <SettingsRow
      testID="settings-streaming"
      icon="musical-notes-outline"
      label={t('settings.streaming')}
      value={platform.data ? PLATFORM_LABELS[platform.data] : t('settings.streamingNone')}
      onPress={() => router.push('/settings/streaming')}
    />
  );
}

/** Liga/desliga o push neste aparelho. */
function PushRow() {
  const { t } = useTranslation();
  const available = pushAvailability();
  const [on, setOn] = useState(pushEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      if (next) {
        const granted = await enablePush();
        setOn(granted);
        if (!granted) setMessage(t('notifications.pushDenied'));
      } else {
        await disablePush();
        setOn(false);
      }
    } catch (err) {
      setMessage(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      testID="settings-push"
      icon="notifications-outline"
      label={t('settings.push')}
      value={!available.ok ? t('settings.pushUnavailable') : (message ?? undefined)}
      right={
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={!available.ok || busy}
          trackColor={{ true: colors.primary, false: colors.surface }}
          accessibilityLabel={t('settings.push')}
        />
      }
      last
    />
  );
}
