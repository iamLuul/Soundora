import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { badgeIcon } from '../assets/badgeIcons';
import { fetchProfileBadges, fetchSupportUrl, type ProfileBadge } from '../lib/api';
import { colors, fonts, radius, space } from '../theme';
import { SheetBackdrop } from './ui';

export const badgeKeys = {
  of: (userId: string) => ['profile-badges', userId] as const,
  supportUrl: ['support-url'] as const,
};

/** Nome e descrição no idioma do app. */
function texts(b: ProfileBadge, lang: string) {
  const pt = lang.startsWith('pt');
  return { name: pt ? b.name_pt : b.name_en, description: pt ? b.description_pt : b.description_en };
}

/**
 * Selos do perfil: uma fileira de ícones entre a bio e as músicas favoritas. Tocar num selo abre
 * ele grande, com nome, data e o que ele representa. Os selos não dão vantagem nenhuma: são só
 * para mostrar. Sem selos, o bloco não aparece.
 */
export function ProfileBadges({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const badges = useQuery({ queryKey: badgeKeys.of(userId), queryFn: () => fetchProfileBadges(userId), staleTime: 5 * 60_000 });
  const [open, setOpen] = useState<ProfileBadge | null>(null);
  const list = badges.data ?? [];
  if (!list.length) return null;

  return (
    <View testID="profile-badges" style={styles.card}>
      <Text style={styles.title}>{t('badges.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {list.map((b) => (
          <Pressable
            key={b.slug}
            testID={`badge-${b.slug}`}
            accessibilityRole="button"
            accessibilityLabel={texts(b, i18n.language).name}
            accessibilityHint={t('badges.openHint')}
            onPress={() => setOpen(b)}
            hitSlop={4}
            style={({ pressed }) => pressed && { opacity: 0.75 }}
          >
            <SvgXml xml={badgeIcon(b.icon)} width={40} height={40} />
          </Pressable>
        ))}
      </ScrollView>
      <BadgeOverlay badge={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** O selo grande sobre a tela: desenho, nome, data em que recebeu e a descrição. */
export function BadgeOverlay({ badge, onClose }: { badge: ProfileBadge | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  // Web: quem vê o selo de contribuidor (ainda disponível) pode ir à página de apoio.
  const web = Platform.OS === 'web';
  const support = useQuery({ queryKey: badgeKeys.supportUrl, queryFn: fetchSupportUrl, enabled: web && !!badge, staleTime: 10 * 60_000 });
  if (!badge) return null;
  const { name, description } = texts(badge, i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language || 'pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(badge.granted_at));
  const supportUrl = web && badge.slug === 'early_supporter' && !badge.limited ? support.data : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop style={styles.backdrop} onClose={onClose} label={t('common.close')}>
        <View testID="badge-overlay" style={styles.sheet} accessibilityViewIsModal>
          <Pressable testID="badge-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={10} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <SvgXml xml={badgeIcon(badge.icon)} width={120} height={120} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          <Text style={styles.date}>{t('badges.receivedOn', { date })}</Text>
          {badge.limited ? (
            <View style={styles.limited}>
              <Text style={styles.limitedText}>{t('badges.limited')}</Text>
            </View>
          ) : null}
          <Text style={styles.description}>{description}</Text>
          {supportUrl ? (
            <Pressable testID="badge-support" accessibilityRole="link" onPress={() => void Linking.openURL(supportUrl)} style={styles.support}>
              <Text style={styles.supportText}>{t('support.cta')}</Text>
            </Pressable>
          ) : null}
        </View>
      </SheetBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Mesmo cartão das músicas favoritas (logo abaixo).
  card: { marginHorizontal: 20, borderRadius: 10, backgroundColor: colors.card, padding: space.md, gap: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  row: { gap: space.md, alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  sheet: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
  },
  close: { position: 'absolute', top: space.md, right: space.md },
  name: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center', marginTop: space.sm },
  date: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  limited: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.muted, paddingHorizontal: space.md, paddingVertical: 2 },
  limitedText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.muted },
  description: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text, textAlign: 'center', marginTop: space.xs },
  support: { marginTop: space.md, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: 10 },
  supportText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
});
