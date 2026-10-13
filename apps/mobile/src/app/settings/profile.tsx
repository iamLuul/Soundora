import { MIN_GENRES } from '@soundora/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GenrePicker } from '../../components/GenrePicker';
import { Avatar, Button, ErrorText, Screen, TextField } from '../../components/ui';
import { BIO_MAX, getMyGenres, removeProfileImage, setMyGenres, updateProfile, type ProfileImageKind } from '../../lib/api';
import { useGenres } from '../../lib/queries';
import { useAuth } from '../../lib/auth';
import { bannerUrl } from '../../lib/avatar';
import { formatError } from '../../lib/errors';
import { pickAndUploadProfileImage } from '../../lib/pick-image';
import { colors, fonts, space } from '../../theme';
import { webTouch } from '../../lib/touch';
import { Spinner } from '../../components/Spinner';
import { showToast } from '../../components/Toast';

/** Editar perfil: banner, foto (centralizada sobre o banner, como no perfil), nome e bio. */
export default function EditProfileScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [busy, setBusy] = useState<null | ProfileImageKind | 'save'>(null);
  const [error, setError] = useState<string | null>(null);
  // Gêneros do perfil: alimentam as sugestões do Descobrir.
  const myGenres = useQuery({ queryKey: ['my-genres'], queryFn: getMyGenres });
  const allGenres = useGenres();
  const [genres, setGenres] = useState<string[] | null>(null);
  const shownGenres = genres ?? myGenres.data ?? [];

  if (!profile) return null;
  const banner = bannerUrl(profile.banner_url);

  const refreshEverywhere = async () => {
    await refreshProfile();
    await qc.invalidateQueries({ queryKey: ['profile'] });
    await qc.invalidateQueries({ queryKey: ['feed'] });
    await qc.invalidateQueries({ queryKey: ['profile-posts'] });
  };

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
      return true;
    } catch (err) {
      setError(formatError(t, err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const change = (kind: ProfileImageKind) =>
    run(kind, async () => {
      if (await pickAndUploadProfileImage(kind)) await refreshEverywhere();
    });
  const remove = (kind: ProfileImageKind) =>
    run(kind, async () => {
      await removeProfileImage(kind);
      await refreshEverywhere();
    });

  const save = async () => {
    if (genres && genres.length < MIN_GENRES) return setError(t('errors.genres_too_few'));
    const ok = await run('save', async () => {
      await updateProfile({ displayName, bio });
      if (genres) {
        await setMyGenres(genres);
        await qc.invalidateQueries({ queryKey: ['my-genres'] });
        await qc.invalidateQueries({ queryKey: ['discover-deck'] });
        // Os gêneros que aparecem no perfil.
        await qc.invalidateQueries({ queryKey: ['user-genres'] });
      }
      await refreshEverywhere();
    });
    if (ok) {
      showToast(t('toast.profileSaved'));
      router.back();
    }
  };

  return (
    <Screen scroll style={styles.container}>
      <Stack.Screen options={{ title: t('editProfile.title') }} />

      <View>
        <Pressable testID="change-banner" onPress={() => change('banner')} disabled={!!busy} accessibilityRole="button" accessibilityLabel={t('profile.changeBanner')} style={styles.banner}>
          {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          {busy === 'banner' ? <Spinner color={colors.text} /> : <Text style={styles.bannerLabel}>{t('profile.changeBanner')}</Text>}
        </Pressable>
        <View style={styles.avatarWrap}>
          <Pressable testID="change-photo" onPress={() => change('avatar')} disabled={!!busy} accessibilityRole="button" accessibilityLabel={t('profile.changePhoto')} style={styles.avatarRing}>
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={72} />
            {busy === 'avatar' ? <Spinner color={colors.text} style={StyleSheet.absoluteFill} /> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.links}>
        <Link label={t('profile.changePhoto')} onPress={() => change('avatar')} disabled={!!busy} />
        {profile.avatar_url ? <Link label={t('editProfile.removePhoto')} danger onPress={() => remove('avatar')} disabled={!!busy} /> : null}
        {profile.banner_url ? <Link label={t('editProfile.removeBanner')} danger onPress={() => remove('banner')} disabled={!!busy} /> : null}
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
      <GenrePicker
        title={t('editProfile.genres')}
        value={shownGenres}
        onChange={setGenres}
        max={10}
        suggestions={(allGenres.data ?? []).map((g) => g.slug)}
      />
      <Text style={styles.hint}>{t('editProfile.genresHint', { min: MIN_GENRES })}</Text>
      <ErrorText>{error}</ErrorText>
      <Button testID="save-profile" title={t('common.save')} onPress={save} loading={busy === 'save'} disabled={!!busy} />
    </Screen>
  );
}

function Link({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={8} style={webTouch(8)}>
      <Text style={[styles.link, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  banner: {
    aspectRatio: 3,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  bannerLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text, backgroundColor: colors.overlay, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: 10, overflow: 'hidden' },
  avatarWrap: { alignItems: 'center', marginTop: -44 },
  avatarRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space.lg, marginTop: -space.sm },
  link: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: -space.sm },
});
