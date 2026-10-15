import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { chartTrackLink, fetchWorldChart, type ChartTrack } from '../../lib/api';
import { keys } from '../../lib/queries';
import { colors, fonts, space, text } from '../../theme';
import { DiscoverLiked } from '../DiscoverLiked';
import { SearchField } from '../figma';
import { TrackListSkeleton } from '../Skeleton';
import { useStreamingOpener } from '../StreamingOpener';
import { SuggestedAccounts } from '../SuggestedAccounts';
import { ChartRow } from '../WorldChart';

/** Músicas da lista "mais ouvidas" na coluna (Figma: 10). */
const CHART_ROWS = 10;

/**
 * Coluna da direita do desktop (Figma: Home e Discover).
 * - Descobrir: contas para seguir e as músicas curtidas no Descobrir.
 * - Outras telas: busca, contas para seguir e as mais ouvidas da semana.
 * Embaixo, os links do rodapé (termos, privacidade, cookies...).
 * Tudo vem das mesmas consultas das telas do celular (nada novo no servidor).
 */
export function RightPanel() {
  const { t } = useTranslation();
  const path = usePathname();
  const discover = path.startsWith('/discover');
  return (
    // Largura fixa por fora: na web o ScrollView cresce para ocupar o espaço que sobra.
    <View style={styles.panel}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      role="complementary"
      aria-label={t('desktop.panel')}
    >
      {discover ? null : <PanelSearch />}
      <SuggestedAccounts panel testID="panel-suggested" />
      {discover ? <DiscoverLiked panel /> : <MostListened />}
      <Footer />
    </ScrollView>
    </View>
  );
}

/** Busca: Enter abre a aba Buscar do Descobrir com o termo. */
function PanelSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const submit = () => {
    const q = query.trim().slice(0, 100);
    if (!q) return;
    router.navigate({ pathname: '/discover', params: { section: 'search', q } });
    setQuery('');
  };
  return <SearchField testID="panel-search" value={query} onChangeText={setQuery} onSubmitEditing={submit} placeholder={t('search.placeholder')} maxLength={100} />;
}

/** Figma: Most Listened Songs — as 10 primeiras do ranking da semana; abre na plataforma da pessoa. */
function MostListened() {
  const { t } = useTranslation();
  const chart = useQuery({ queryKey: keys.worldChart, queryFn: fetchWorldChart, staleTime: 10 * 60_000 });
  const { open, opening, message, chooser } = useStreamingOpener((target, choice) => chartTrackLink(target.key, choice));
  const onPress = (item: ChartTrack) => open({ key: item.key, title: item.title, artist: item.artist });
  const items = (Array.isArray(chart.data) ? [] : (chart.data?.entries ?? [])).slice(0, CHART_ROWS);
  if (!chart.isLoading && !items.length) return null;
  return (
    <View style={{ gap: space.xs }} testID="panel-chart">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('desktop.mostListened')}
        </Text>
        <View style={styles.week}>
          <Ionicons name="calendar-outline" size={12} color={colors.text} />
          <Text style={styles.weekText}>{t('trending.thisWeek')}</Text>
        </View>
      </View>
      {chart.isLoading ? (
        <TrackListSkeleton count={5} rank />
      ) : (
        items.map((item) => <ChartRow key={item.key} item={item} onPress={onPress} opening={opening === item.key} compact />)
      )}
      {message ? <Text style={[text.small, { color: colors.danger }]}>{message}</Text> : null}
      {chooser}
    </View>
  );
}

/** Rodapé (Figma: About, Accessibility, Ad, Cookies, Language, Privacy, Terms). Só links internos. */
function Footer() {
  const { t } = useTranslation();
  const links: { key: string; label: string; href: Href }[] = [
    { key: 'about', label: t('legal.about'), href: '/settings/about' },
    { key: 'accessibility', label: t('desktop.accessibility'), href: '/settings/accessibility' },
    { key: 'ads', label: t('legal.ads'), href: '/legal/ads' },
    { key: 'cookies', label: t('legal.cookies'), href: '/legal/cookies' },
    { key: 'language', label: t('desktop.language'), href: '/settings/preferences' },
    { key: 'privacy', label: t('legal.privacy'), href: '/legal/privacy' },
    { key: 'terms', label: t('legal.terms'), href: '/legal/terms' },
  ];
  return (
    <View style={styles.footer} role="contentinfo">
      {links.map((l) => (
        <Pressable key={l.key} testID={`footer-${l.key}`} accessibilityRole="link" onPress={() => router.push(l.href)} hitSlop={4}>
          <Text style={styles.footerText}>{l.label}</Text>
        </Pressable>
      ))}
      <Text style={styles.footerText}>{t('desktop.copyright', { year: new Date().getFullYear() })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: 340, height: '100%', flexGrow: 0, flexShrink: 0 },
  content: { gap: space.xl, paddingTop: 40, paddingBottom: space.xxl, paddingLeft: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  week: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekText: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: space.xs },
  footerText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
