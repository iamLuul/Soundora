import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '../../components/figma';
import { LEGAL_UPDATED_AT, legalSections, type LegalDoc } from '../../lib/legal';
import { colors, fonts, space } from '../../theme';

/** Termos de Uso (/legal/terms) e Política de Privacidade (/legal/privacy). Abrem sem login. */
export default function LegalScreen() {
  const { doc: raw } = useLocalSearchParams<{ doc: string }>();
  const doc: LegalDoc = raw === 'privacy' ? 'privacy' : 'terms';
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const updated = new Date(`${LEGAL_UPDATED_AT}T12:00:00Z`).toLocaleDateString(i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <BackHeader />
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
          {t(doc === 'privacy' ? 'legal.privacy' : 'legal.terms')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}>
        <Text style={styles.updated}>{t('legal.updatedAt', { date: updated })}</Text>
        {legalSections(doc, i18n.language).map((s) => (
          <View key={s.title} style={{ gap: space.sm }}>
            <Text style={styles.section} accessibilityRole="header">
              {s.title}
            </Text>
            {s.paragraphs.map((p) => (
              <Text key={p} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { justifyContent: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
  topTitle: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '70%' },
  content: { padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  updated: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  section: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  paragraph: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
});
