import { passwordSchema } from '@soundora/core';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { PasswordField } from '../../components/auth/PasswordField';
import { Button, ErrorText, Screen, TextField } from '../../components/ui';
import { changePassword, requestReauthentication } from '../../lib/api';
import { authErrorKey } from '../../lib/auth-errors';
import { AppError, formatError } from '../../lib/errors';
import { colors, text } from '../../theme';

/**
 * Redefinir a senha. Numa sessão com mais de 24 h o Supabase pede um código enviado ao
 * e-mail antes de trocar (secure_password_change); aí aparece o campo do código.
 */
export default function PasswordScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Erros de digitação ficam embaixo do campo; os do servidor, no fim da tela.
  const [fieldError, setFieldError] = useState<{ field: 'password' | 'confirm'; message: string } | null>(null);

  const save = async () => {
    setError(null);
    setNotice(null);
    setFieldError(null);
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) return setFieldError({ field: 'password', message: t(`errors.${pw.error.issues[0]?.message ?? 'password_too_short'}`) });
    if (password !== confirm) return setFieldError({ field: 'confirm', message: formatError(t, new AppError('passwords_differ')) });
    if (code !== null && code.length !== 6) return;
    setBusy(true);
    try {
      await changePassword(password, code ?? undefined);
      setPassword('');
      setConfirm('');
      setCode(null);
      setNotice(t('editProfile.passwordSaved'));
    } catch (err) {
      if (authErrorKey(err) === 'auth.reauthNeeded' && code === null) {
        try {
          await requestReauthentication();
          setCode('');
          setNotice(t('auth.reauthNeeded'));
        } catch (sendErr) {
          setError(t(authErrorKey(sendErr)));
        }
      } else {
        const key = authErrorKey(err);
        setError(key === 'common.error' ? formatError(t, err) : t(key));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: t('settings.password') }} />
      <Text style={text.body}>{t('editProfile.passwordHint')}</Text>
      <PasswordField
        testID="new-password"
        label={t('editProfile.newPassword')}
        hint={t('auth.passwordHint')}
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setFieldError(null);
        }}
        error={fieldError?.field === 'password' ? fieldError.message : null}
        newPassword
      />
      <PasswordField
        testID="confirm-password"
        label={t('editProfile.confirmPassword')}
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          setFieldError(null);
        }}
        error={fieldError?.field === 'confirm' ? fieldError.message : null}
        newPassword
        onSubmitEditing={save}
      />
      {code !== null ? (
        <TextField
          testID="reauth-code"
          label={t('auth.code')}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
        />
      ) : null}
      <ErrorText>{error}</ErrorText>
      {notice ? <Text style={[text.body, { color: colors.success }]}>{notice}</Text> : null}
      <Button testID="save-password" title={t('editProfile.savePassword')} onPress={save} loading={busy} disabled={busy || !password} />
    </Screen>
  );
}
