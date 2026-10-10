import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, ErrorText, Screen, TextField } from '../../components/ui';
import { BIO_MAX, changePassword, removeAvatar, requestReauthentication, updateProfile, uploadAvatar } from '../../lib/api';
import { authErrorKey } from '../../lib/auth-errors';
import { useAuth } from '../../lib/auth';
import { AppError, formatError } from '../../lib/errors';
import { colors, space, text } from '../../theme';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // Sessão antiga: o Supabase pede um código enviado ao e-mail antes de trocar a senha.
  const [reauthCode, setReauthCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'photo' | 'save' | 'password'>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!profile) return null;

  const refreshEverywhere = async () => {
    await refreshProfile();
    await qc.invalidateQueries({ queryKey: ['profile'] });
    await qc.invalidateQueries({ queryKey: ['feed'] });
    await qc.invalidateQueries({ queryKey: ['profile-posts'] });
  };

  const pickPhoto = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    setBusy('photo');
    try {
      await uploadAvatar(result.assets[0].uri);
      await refreshEverywhere();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const deletePhoto = async () => {
    setBusy('photo');
    setError(null);
    try {
      await removeAvatar();
      await refreshEverywhere();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      await updateProfile({ displayName, bio });
      await refreshEverywhere();
      router.back();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const savePassword = async () => {
    setPasswordError(null);
    setNotice(null);
    if (password !== confirm) return setPasswordError(formatError(t, new AppError('passwords_differ')));
    if (reauthCode !== null && reauthCode.length !== 6) return;
    setBusy('password');
    try {
      await changePassword(password, reauthCode ?? undefined);
      setPassword('');
      setConfirm('');
      setReauthCode(null);
      setNotice(t('editProfile.passwordSaved'));
    } catch (err) {
      if (authErrorKey(err) === 'auth.reauthNeeded' && reauthCode === null) {
        try {
          await requestReauthentication();
          setReauthCode('');
          setNotice(t('auth.reauthNeeded'));
        } catch (sendErr) {
          setPasswordError(t(authErrorKey(sendErr)));
        }
      } else {
        const key = authErrorKey(err);
        setPasswordError(key === 'common.error' ? formatError(t, err) : t(key));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <Stack.Screen options={{ title: t('editProfile.title') }} />

      <View style={styles.photoRow}>
        <View>
          <Avatar uri={profile.avatar_url} name={profile.display_name} size={96} />
          {busy === 'photo' ? <ActivityIndicator color={colors.text} style={StyleSheet.absoluteFill} /> : null}
        </View>
        <View style={{ gap: space.sm, flex: 1 }}>
          <Button testID="change-photo" title={t('editProfile.changePhoto')} onPress={pickPhoto} disabled={!!busy} />
          {profile.avatar_url ? (
            <Pressable accessibilityRole="button" onPress={deletePhoto} disabled={!!busy}>
              <Text style={[text.small, { color: colors.danger, textAlign: 'center' }]}>{t('editProfile.removePhoto')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <TextField testID="edit-name" label={t('onboarding.displayName')} value={displayName} onChangeText={setDisplayName} maxLength={50} />
      <TextField
        testID="edit-bio"
        label={t('editProfile.bio')}
        placeholder={t('editProfile.bioPlaceholder')}
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={BIO_MAX}
        hint={`${bio.length}/${BIO_MAX}`}
        style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: space.md }}
      />
      <ErrorText>{error}</ErrorText>
      <Button testID="save-profile" title={t('common.save')} onPress={save} loading={busy === 'save'} disabled={!!busy} />

      <View style={styles.section}>
        <Text style={text.subtitle}>{t('editProfile.passwordTitle')}</Text>
        <Text style={text.small}>{t('editProfile.passwordHint')}</Text>
        <TextField
          testID="new-password"
          label={t('editProfile.newPassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          testID="confirm-password"
          label={t('editProfile.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {reauthCode !== null ? (
          <TextField
            testID="reauth-code"
            label={t('auth.code')}
            value={reauthCode}
            onChangeText={(v) => setReauthCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
        ) : null}
        <ErrorText>{passwordError}</ErrorText>
        {notice ? <Text style={[text.body, { color: colors.success }]}>{notice}</Text> : null}
        <Button
          testID="save-password"
          title={t('editProfile.savePassword')}
          variant="ghost"
          onPress={savePassword}
          loading={busy === 'password'}
          disabled={!!busy || !password}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  section: { gap: space.md, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
