import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { router } from 'expo-router';
import { Button, Chip } from '../../components/ui';
import { updateLocale } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { LOCALES } from '../../lib/i18n';
import { colors, space } from '../../theme';

export default function MyProfileScreen() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  if (!profile) return null;

  const changeLanguage = async (locale: 'pt-BR' | 'en') => {
    await i18n.changeLanguage(locale);
    await updateLocale(locale).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProfileView
        username={profile.username}
        footer={
          <View style={{ gap: space.md }}>
            <Button testID="edit-profile" title={t('profile.edit')} onPress={() => router.push('/settings/profile')} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {LOCALES.map((l) => (
                <Chip key={l} label={l === 'pt-BR' ? 'Português' : 'English'} selected={i18n.language === l} onPress={() => changeLanguage(l)} />
              ))}
            </View>
            <Button title={t('profile.signOut')} variant="ghost" onPress={signOut} />
          </View>
        }
      />
    </View>
  );
}
