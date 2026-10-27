import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { badgeIcon } from '../assets/badgeIcons';
import { fetchSupportUrl } from '../lib/api';
import { colors, fonts, glass, radius, space } from '../theme';
import { badgeKeys } from './ProfileBadges';
import { SettingsRow } from './Settings';

/**
 * Apoio ao Soundhora (Patreon): só na versão Web. Nos apps, nada sobre doação aparece (regras
 * das lojas). O link vem do banco (app_config.support_url, só Patreon); sem link, nada aparece.
 */
export function useSupportUrl(): string | null {
  const web = Platform.OS === 'web';
  const q = useQuery({ queryKey: badgeKeys.supportUrl, queryFn: fetchSupportUrl, enabled: web, staleTime: 10 * 60_000 });
  return web ? (q.data ?? null) : null;
}

const open = (url: string) => void Linking.openURL(url);

/** Linha em Configurações › Sobre. */
export function SupportRow() {
  const { t } = useTranslation();
  const url = useSupportUrl();
  if (!url) return null;
  return <SettingsRow testID="settings-support" icon="heart-outline" label={t('support.title')} onPress={() => open(url)} last />;
}

/** Cartão da coluna da direita (desktop): o selo, o convite e o botão. */
export function SupportCard() {
  const { t } = useTranslation();
  const url = useSupportUrl();
  if (!url) return null;
  return (
    <View testID="panel-support" style={styles.card}>
      <View style={styles.head}>
        <SvgXml xml={badgeIcon('early_supporter')} width={36} height={36} />
        <Text style={styles.title}>{t('support.title')}</Text>
      </View>
      <Text style={styles.body}>{t('support.body')}</Text>
      <Pressable
        testID="panel-support-link"
        accessibilityRole="link"
        onPress={() => open(url)}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.buttonText}>{t('support.cta')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...glass.card, borderRadius: 18, padding: space.md, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.text },
  button: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 8 },
  buttonText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
});
