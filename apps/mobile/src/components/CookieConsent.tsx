import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { useConsent } from '../lib/consent';
import { chooseConsent, useConsentSync } from '../lib/consent-sync';
import { useWebLayout } from '../lib/layout';
import { colors, fonts, glass, radius, space } from '../theme';
import { tabBarSpace } from './TabBar';
import { Button } from './ui';

/**
 * Aviso de cookies na primeira visita ao site, até a pessoa escolher (LGPD). Só na web: no app do
 * celular a escolha é feita ao criar a conta (passo do onboarding) e em Configurações.
 * - "Aceitar todos" e "Só os necessários" têm o mesmo peso: recusar é tão fácil quanto aceitar.
 * - Até a escolha, vale "só os necessários" (nada opcional é gravado).
 * - "Escolher" abre a tela com cada categoria (a mesma de Configurações).
 * Não cobre a tela: dá para continuar usando o app com o aviso aberto.
 */
export function CookieConsent() {
  const { t } = useTranslation();
  const consent = useConsent();
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();
  const layout = useWebLayout();
  const path = usePathname();
  // A escolha feita antes de entrar vai para a conta assim que ela existe de fato (com perfil).
  useConsentSync(profile ? userId : null);

  // App do celular, já escolheu, ou está na própria tela de escolher / lendo a política.
  if (Platform.OS !== 'web' || consent || path === '/cookies' || path.startsWith('/legal')) return null;

  const mobile = layout === 'mobile';
  // No celular com o app aberto, fica acima da barra de abas flutuante.
  const bottom = mobile && profile ? tabBarSpace(insets.bottom) : insets.bottom + space.md;
  const choose = (all: boolean) => chooseConsent({ preferences: all, personalization: all }, userId);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <View
        testID="cookie-consent"
        accessibilityRole="alert"
        accessibilityLabel={t('cookies.bannerTitle')}
        style={[styles.card, { marginBottom: bottom }, mobile ? styles.cardMobile : styles.cardDesktop]}
      >
        <View style={styles.titleRow}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
          <Text style={styles.title} accessibilityRole="header">
            {t('cookies.bannerTitle')}
          </Text>
        </View>
        <Text style={styles.body}>{t('cookies.bannerBody')}</Text>
        <View style={[styles.buttons, mobile && styles.buttonsMobile]}>
          <Button
            testID="cookie-accept-all"
            title={t('cookies.acceptAll')}
            size="sm"
            onPress={() => choose(true)}
            style={mobile ? styles.buttonMobile : styles.button}
          />
          <Button
            testID="cookie-only-necessary"
            title={t('cookies.onlyNecessary')}
            size="sm"
            onPress={() => choose(false)}
            style={mobile ? styles.buttonMobile : styles.button}
          />
        </View>
        <View style={styles.links}>
          <Text testID="cookie-customize" style={styles.link} accessibilityRole="link" onPress={() => router.push('/cookies')}>
            {t('cookies.customize')}
          </Text>
          <Text testID="cookie-policy" style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal/cookies')}>
            {t('legal.cookies')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { justifyContent: 'flex-end', zIndex: 50 },
  card: { ...glass.sheet, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  cardMobile: { marginHorizontal: space.md },
  cardDesktop: { alignSelf: 'center', width: '100%', maxWidth: 560 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.text },
  buttons: { flexDirection: 'row', gap: space.sm },
  // Celular: um embaixo do outro (lado a lado o texto quebrava), com o mesmo tamanho.
  buttonsMobile: { flexDirection: 'column' },
  button: { flex: 1 },
  buttonMobile: { alignSelf: 'stretch' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: space.xl },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
});
