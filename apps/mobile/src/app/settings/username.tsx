import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { Button, ErrorText, Screen, TextField } from '../../components/ui';
import { changeUsername, USERNAME_CHANGE_DAYS } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatError } from '../../lib/errors';
import { nextUsernameChange, useUsernameStatus, validateUsernameFormat } from '../../lib/username';
import { colors, space, text } from '../../theme';

export default function UsernameScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typed = username.trim().toLowerCase();
  const unchanged = typed === profile?.username;
  // Só consulta o banco quando o @ digitado é diferente do atual.
  const status = useUsernameStatus(unchanged ? '' : username);
  if (!profile) return null;

  const blockedUntil = nextUsernameChange(profile.username_changed_at);

  const save = async () => {
    setError(null);
    const format = validateUsernameFormat(username);
    if (!format.ok) return setError(t(`errors.${format.reason}`));
    setBusy(true);
    try {
      await changeUsername(format.username);
      await refreshProfile();
      await qc.invalidateQueries();
      router.back();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: t('settings.username') }} />
      <Text style={text.body}>{t('settings.usernameHint', { days: USERNAME_CHANGE_DAYS })}</Text>
      {blockedUntil ? (
        <Text style={[text.body, { color: colors.warning }]}>{t('settings.usernameBlocked', { date: blockedUntil.toLocaleDateString(i18n.language) })}</Text>
      ) : null}
      <TextField
        testID="new-username"
        label={t('onboarding.username')}
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!blockedUntil}
        hint={status.state === 'checking' ? t('onboarding.usernameChecking') : t('onboarding.usernameHint')}
        error={status.state === 'invalid' ? t(`errors.${status.reason}`) : status.state === 'taken' ? t('errors.username_taken') : status.state === 'error' ? status.message : null}
        success={status.state === 'available' ? t('onboarding.usernameAvailable', { username: status.username }) : null}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        testID="save-username"
        title={t('common.save')}
        onPress={save}
        loading={busy}
        disabled={!!blockedUntil || unchanged || status.state !== 'available'}
      />
      <Text style={[text.small, { marginTop: space.sm }]}>{t('settings.usernameNote')}</Text>
    </Screen>
  );
}
