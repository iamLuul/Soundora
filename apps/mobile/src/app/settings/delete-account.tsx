import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button, ErrorText, Screen, TextField } from '../../components/ui';
import { deleteAccount } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorCode, formatError } from '../../lib/errors';
import { colors, space, text } from '../../theme';

/** Excluir a conta: a pessoa digita o próprio @ e o servidor exige login recente. */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  if (!profile) return null;

  const matches = confirm.trim().replace(/^@/, '').toLowerCase() === profile.username;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(confirm);
      // A sessão já não vale: sai e volta para a tela de entrar.
      await signOut().catch(() => undefined);
    } catch (err) {
      if (errorCode(err) === 'reauth_required') setNeedsLogin(true);
      setError(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: t('settings.deleteAccount') }} />
      <Text style={text.body}>{t('settings.deleteIntro')}</Text>
      <View style={{ gap: space.xs }}>
        {(['deletePosts', 'deleteProfile', 'deletePhotos', 'deleteSocial'] as const).map((k) => (
          <Text key={k} style={text.body}>
            • {t(`settings.${k}`)}
          </Text>
        ))}
      </View>
      <Text style={[text.body, { color: colors.warning }]}>{t('settings.deleteForever')}</Text>
      <TextField
        testID="delete-confirm"
        label={t('settings.deleteConfirmLabel', { username: profile.username })}
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={`@${profile.username}`}
      />
      <ErrorText>{error}</ErrorText>
      {needsLogin ? <Button title={t('settings.signInAgain')} variant="ghost" onPress={signOut} /> : null}
      <Button testID="delete-account" title={t('settings.deleteButton')} variant="danger" onPress={remove} loading={busy} disabled={!matches || busy} />
    </Screen>
  );
}
