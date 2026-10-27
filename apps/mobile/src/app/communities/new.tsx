import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityForm } from '../../components/communities/CommunityForm';
import { BackHeader } from '../../components/figma';
import { keyboardBehavior } from '../../components/ui';
import { createCommunity } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { colors, fonts, space, text } from '../../theme';

/** Criar uma comunidade: quem cria vira a dona. */
export default function NewCommunityScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + space.sm }]} behavior={keyboardBehavior}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        <BackHeader />
        <View style={{ gap: space.xs }}>
          <Text style={styles.title} accessibilityRole="header">
            {t('communities.create')}
          </Text>
          <Text style={text.small}>{t('communities.createIntro')}</Text>
        </View>
        <CommunityForm
          creating
          busy={busy}
          error={error}
          submitLabel={t('communities.createButton')}
          onSubmit={async (value) => {
            setBusy(true);
            setError(null);
            try {
              await createCommunity(value);
              await qc.invalidateQueries({ queryKey: ['communities'] });
              router.replace(`/c/${value.slug}`);
            } catch (err) {
              setError(formatError(t, err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
});
