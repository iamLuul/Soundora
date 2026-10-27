import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityForm } from '../../../components/communities/CommunityForm';
import { ErrorScreen } from '../../../components/ErrorScreen';
import { BackHeader } from '../../../components/figma';
import { Spinner } from '../../../components/Spinner';
import { showToast } from '../../../components/Toast';
import { Button, keyboardBehavior } from '../../../components/ui';
import { deleteCommunity, updateCommunity } from '../../../lib/api';
import { confirmAction, notify } from '../../../lib/dialogs';
import { formatError } from '../../../lib/errors';
import { useCommunity } from '../../../lib/queries';
import { colors, fonts, space, text } from '../../../theme';

/** Configurações da comunidade (só a dona): editar tudo menos o @, ou apagar. */
export default function CommunitySettingsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const community = useCommunity(slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = community.data;

  if (community.isLoading) return <Spinner style={{ flex: 1, backgroundColor: colors.background }} />;
  if (!c) return <ErrorScreen code={404} />;
  if (c.my_role !== 'owner' || c.my_status !== 'active') return <ErrorScreen code={403} />;

  const remove = async () => {
    if (!(await confirmAction(t('communities.deleteConfirm', { name: c.name }), t('communities.delete'), t('common.cancel')))) return;
    try {
      await deleteCommunity(c.id);
      await qc.invalidateQueries({ queryKey: ['communities'] });
      showToast(t('communities.deleted'));
      router.replace('/communities');
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + space.sm }]} behavior={keyboardBehavior}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header">
          {t('communities.settings')}
        </Text>
        <CommunityForm
          creating={false}
          initial={{ name: c.name, description: c.description, visibility: c.visibility, genres: c.genres, artists: c.artists, color: c.color }}
          busy={busy}
          error={error}
          submitLabel={t('common.save')}
          onSubmit={async (value) => {
            setBusy(true);
            setError(null);
            try {
              await updateCommunity(c.id, value);
              await qc.invalidateQueries({ queryKey: ['communities'] });
              showToast(t('communities.saved'));
              router.back();
            } catch (err) {
              setError(formatError(t, err));
            } finally {
              setBusy(false);
            }
          }}
        />
        <Text style={[text.small, { marginTop: space.lg }]}>{t('communities.deleteHint')}</Text>
        <Button testID="community-delete" title={t('communities.delete')} variant="danger" onPress={remove} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
});
