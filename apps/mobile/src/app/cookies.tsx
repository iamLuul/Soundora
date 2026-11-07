import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Toggle } from '../components/Toggle';
import { SettingsRow, SettingsScreen, SettingsSection } from '../components/Settings';
import { showToast } from '../components/Toast';
import { Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { clearCategory, storedSummary, useConsent, type OptionalCategory, type StorageCategory } from '../lib/consent';
import { chooseConsent } from '../lib/consent-sync';
import { colors, fonts, glass, space } from '../theme';

/** Itens que só existem no celular (não aparecem na web). */
const NATIVE_ONLY = new Set(['push']);

/**
 * Cookies e dados deste aparelho (LGPD): o que o Soundhora guarda, para quê e por quanto tempo,
 * com a escolha de cada categoria opcional e o botão de apagar. Abre com ou sem login (o aviso
 * da primeira visita leva para cá). Com login, também leva aos dados guardados na conta.
 */
export default function CookiesScreen() {
  const { t, i18n } = useTranslation();
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const consent = useConsent();
  const [choice, setChoice] = useState({ preferences: consent?.preferences ?? false, personalization: consent?.personalization ?? false });
  // Recalcula o que está guardado depois de salvar ou apagar.
  const [tick, setTick] = useState(0);
  const summary = storedSummary();
  void tick;

  const save = (next: { preferences: boolean; personalization: boolean }, message: string) => {
    setChoice(next);
    chooseConsent(next, userId);
    setTick((n) => n + 1);
    showToast(message);
  };

  const clearOptional = () => {
    for (const c of ['preferences', 'personalization'] as OptionalCategory[]) clearCategory(c);
    setTick((n) => n + 1);
    showToast(t('cookies.cleared'));
  };

  const decided = consent
    ? t('cookies.decidedAt', {
        date: new Date(consent.at).toLocaleString(i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }),
      })
    : t('cookies.notDecided');
  const changed = !consent || consent.preferences !== choice.preferences || consent.personalization !== choice.personalization;

  const items = (category: StorageCategory) =>
    summary
      .filter((s) => s.item.category === category && !(Platform.OS === 'web' && NATIVE_ONLY.has(s.item.id)))
      .map((s) => (
        <View key={s.item.id} testID={`cookie-item-${s.item.id}`} style={styles.item}>
          <Text style={styles.itemName}>{t(`cookies.item_${s.item.id}`)}</Text>
          <Text style={styles.itemDesc}>{t(`cookies.item_${s.item.id}_desc`)}</Text>
          <Text style={styles.itemMeta}>
            {t(`cookies.item_${s.item.id}_keep`)} · {s.keys.length ? t('cookies.storedNow', { size: formatBytes(s.bytes) }) : t('cookies.storedNothing')}
          </Text>
        </View>
      ));

  const category = (id: StorageCategory, toggle?: { value: boolean; onChange: (v: boolean) => void }) => (
    <SettingsSection title={t(`cookies.cat_${id}`)} note={t(`cookies.cat_${id}_note`)}>
      <View style={styles.catHeader}>
        <Text style={styles.catLabel}>{toggle ? t('cookies.allow') : t('cookies.alwaysOn')}</Text>
        <Toggle
          testID={`cookie-switch-${id}`}
          value={toggle ? toggle.value : true}
          disabled={!toggle}
          onValueChange={toggle?.onChange}
          accessibilityLabel={t(`cookies.cat_${id}`)}
        />
      </View>
      {items(id)}
    </SettingsSection>
  );

  return (
    <SettingsScreen title={t('cookies.title')}>
      <View style={styles.intro}>
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
        <Text style={styles.introText}>{t('cookies.intro')}</Text>
      </View>
      <Text testID="cookie-decided" style={styles.decided}>
        {decided}
      </Text>

      {category('necessary')}
      {category('preferences', { value: choice.preferences, onChange: (v) => setChoice((c) => ({ ...c, preferences: v })) })}
      {category('personalization', { value: choice.personalization, onChange: (v) => setChoice((c) => ({ ...c, personalization: v })) })}

      <View style={{ gap: space.sm }}>
        <Button testID="cookie-save" title={t('cookies.save')} disabled={!changed} onPress={() => save(choice, t('cookies.saved'))} />
        <View style={styles.row}>
          <Button
            testID="cookie-screen-accept-all"
            variant="ghost"
            size="sm"
            style={{ flex: 1 }}
            title={t('cookies.acceptAll')}
            onPress={() => save({ preferences: true, personalization: true }, t('cookies.saved'))}
          />
          <Button
            testID="cookie-screen-only-necessary"
            variant="ghost"
            size="sm"
            style={{ flex: 1 }}
            title={t('cookies.onlyNecessary')}
            onPress={() => save({ preferences: false, personalization: false }, t('cookies.saved'))}
          />
        </View>
      </View>

      <SettingsSection title={t('cookies.deviceTitle')} note={t('cookies.deviceNote')}>
        <SettingsRow testID="cookie-clear" icon="trash-outline" label={t('cookies.clearOptional')} onPress={clearOptional} last />
      </SettingsSection>

      {/* Dados guardados na conta (servidor): onde ver, mudar e apagar. */}
      {profile ? (
        <SettingsSection title={t('cookies.accountTitle')} note={t('cookies.accountNote')}>
          <SettingsRow
            testID="cookie-search-history"
            icon="time-outline"
            label={t('searchHistory.row')}
            onPress={() => router.push('/settings/search-history')}
          />
          <SettingsRow
            testID="cookie-privacy-settings"
            icon="lock-closed-outline"
            label={t('settings.catPrivacy')}
            onPress={() => router.push('/settings/privacy')}
          />
          <SettingsRow
            testID="cookie-delete-account"
            icon="person-remove-outline"
            label={t('cookies.deleteAccount')}
            onPress={() => router.push('/settings/delete-account')}
            last
          />
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsRow testID="cookie-read-policy" icon="document-text-outline" label={t('legal.cookies')} onPress={() => router.push('/legal/cookies')} />
        <SettingsRow testID="cookie-read-privacy" icon="lock-closed-outline" label={t('legal.privacy')} onPress={() => router.push('/legal/privacy')} last />
      </SettingsSection>
    </SettingsScreen>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  introText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  decided: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  catLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: glass.pressed },
  itemName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  itemDesc: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  itemMeta: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  row: { flexDirection: 'row', gap: space.sm },
});
