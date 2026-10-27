import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityRow } from '../../components/communities/CommunityRow';
import { BackHeader, SearchField } from '../../components/figma';
import { PeopleSkeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import { searchCommunities } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { useMyCommunities, useRecommendedCommunities } from '../../lib/queries';
import { webTouch } from '../../lib/touch';
import { colors, fonts, glass, space, text } from '../../theme';

/** Explorar comunidades: buscar, as minhas, as recomendadas e criar uma nova. */
export default function CommunitiesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 300);
  const searching = q.length >= 2;
  const results = useQuery({ queryKey: ['communities', 'search', q], queryFn: () => searchCommunities(q), enabled: searching });
  const mine = useMyCommunities();
  const recommended = useRecommendedCommunities();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <BackHeader
            right={
              <Pressable
                testID="create-community"
                accessibilityRole="button"
                accessibilityLabel={t('communities.create')}
                onPress={() => router.push('/communities/new')}
                hitSlop={10}
                style={webTouch(10)}
              >
                <Ionicons name="add-circle-outline" size={26} color={colors.text} />
              </Pressable>
            }
          />
          <Text style={styles.title} accessibilityRole="header">
            {t('communities.title')}
          </Text>
          <SearchField testID="community-search" value={query} onChangeText={setQuery} placeholder={t('communities.searchPlaceholder')} />
        </View>

        {searching ? (
          <Section title={t('communities.results')}>
            {results.isFetching && !results.data ? (
              <Spinner style={{ margin: space.lg }} />
            ) : results.data?.length ? (
              results.data.map((c) => <CommunityRow key={c.id} item={c} />)
            ) : (
              <Text style={[text.body, styles.empty]}>{t('communities.noResults', { query: q })}</Text>
            )}
          </Section>
        ) : (
          <>
            <Section title={t('communities.yours')}>
              {mine.isLoading ? (
                <View style={{ paddingHorizontal: space.lg }}>
                  <PeopleSkeleton count={2} avatar={48} />
                </View>
              ) : mine.data?.length ? (
                mine.data.map((c) => <CommunityRow key={c.id} item={c} />)
              ) : (
                <Text style={[text.body, styles.empty]}>{t('communities.noneYet')}</Text>
              )}
            </Section>
            <Section title={t('communities.recommended')}>
              {recommended.isLoading ? (
                <View style={{ paddingHorizontal: space.lg }}>
                  <PeopleSkeleton count={3} avatar={48} />
                </View>
              ) : recommended.data?.length ? (
                recommended.data.map((c) => <CommunityRow key={c.id} item={c} />)
              ) : (
                <Text style={[text.body, styles.empty]}>{t('communities.noRecommended')}</Text>
              )}
            </Section>
            <Pressable testID="create-community-card" accessibilityRole="button" onPress={() => router.push('/communities/new')} style={styles.createCard}>
              <Ionicons name="people-outline" size={26} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={styles.createTitle}>{t('communities.create')}</Text>
                <Text style={text.small}>{t('communities.createIntro')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={styles.section}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.lg, gap: space.md },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  section: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, paddingHorizontal: space.lg, marginBottom: space.xs },
  empty: { color: colors.textMuted, paddingHorizontal: space.lg, paddingVertical: space.md },
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    margin: space.lg,
    padding: space.lg,
    borderRadius: 18,
    ...glass.card,
  },
  createTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
});
