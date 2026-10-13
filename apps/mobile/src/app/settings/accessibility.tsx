import Ionicons from '@expo/vector-icons/Ionicons';
import { reloadAppAsync } from 'expo';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { ChoiceRow, SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { Button } from '../../components/ui';
import { display, ICON_SIZES, readDisplayPrefs, saveDisplayPrefs, TEXT_SIZES, type DisplayPrefs, type IconSize, type TextSize } from '../../lib/display';
import { colors, fonts, space } from '../../theme';

const TEXT_OPTIONS = Object.keys(TEXT_SIZES) as TextSize[];
const ICON_OPTIONS = Object.keys(ICON_SIZES) as IconSize[];

/**
 * Configurações › Acessibilidade: tamanho do texto, dos ícones e menos movimento. Fica neste
 * aparelho. A escala entra em todas as telas ao recarregar o app ("Aplicar"); a prévia mostra
 * o tamanho antes.
 */
export default function AccessibilitySettingsScreen() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<DisplayPrefs>(readDisplayPrefs);
  const changed = prefs.text !== display.text || prefs.icons !== display.icons || prefs.reduceMotion !== display.reduceMotion;
  const update = (next: Partial<DisplayPrefs>) => setPrefs((p) => ({ ...p, ...next }));

  const apply = async () => {
    saveDisplayPrefs(prefs);
    if (Platform.OS === 'web') window.location.reload();
    else await reloadAppAsync('display settings');
  };

  // A prévia usa a escala nova em cima do tamanho padrão (o resto do app muda ao aplicar).
  const previewText = 15 * TEXT_SIZES[prefs.text];
  const previewIcon = 22 * ICON_SIZES[prefs.icons];

  return (
    <SettingsScreen title={t('settings.catAccessibility')}>
      <SettingsSection title={t('settings.textSize')}>
        {TEXT_OPTIONS.map((o, i) => (
          <ChoiceRow
            key={o}
            testID={`text-size-${o}`}
            label={t(`settings.size_${o}`)}
            selected={prefs.text === o}
            onPress={() => update({ text: o })}
            last={i === TEXT_OPTIONS.length - 1}
          />
        ))}
      </SettingsSection>

      <SettingsSection title={t('settings.iconSize')}>
        {ICON_OPTIONS.map((o, i) => (
          <ChoiceRow
            key={o}
            testID={`icon-size-${o}`}
            label={t(`settings.size_${o}`)}
            selected={prefs.icons === o}
            onPress={() => update({ icons: o })}
            last={i === ICON_OPTIONS.length - 1}
          />
        ))}
      </SettingsSection>

      <SettingsSection note={t('settings.systemNote')}>
        <SettingsRow
          icon="walk-outline"
          label={t('settings.reduceMotion')}
          value={t('settings.reduceMotionHint')}
          right={
            <Switch
              testID="reduce-motion-switch"
              value={prefs.reduceMotion}
              onValueChange={(v) => update({ reduceMotion: v })}
              trackColor={{ true: colors.primary, false: colors.surface }}
              accessibilityLabel={t('settings.reduceMotion')}
            />
          }
          last
        />
      </SettingsSection>

      <View testID="display-preview" style={styles.preview} accessible accessibilityLabel={`${t('settings.preview')}: ${t('settings.previewText')}`}>
        <Text style={styles.previewLabel}>{t('settings.preview')}</Text>
        <View style={styles.previewRow}>
          {/* Tamanho já em escala: não passa pela escala de ícones de novo. */}
          <Ionicons name="heart-outline" size={previewIcon / display.iconScale} color={colors.text} />
          <Ionicons name="chatbubble-outline" size={previewIcon / display.iconScale} color={colors.text} />
          <Text style={{ fontFamily: fonts.regular, fontSize: previewText, lineHeight: previewText * 1.4, color: colors.text, flex: 1 }} allowFontScaling>
            {t('settings.previewText')}
          </Text>
        </View>
      </View>

      <Button testID="display-apply" title={t('settings.apply')} onPress={apply} disabled={!changed} />
      {changed ? <Text style={styles.hint}>{t('settings.applyHint')}</Text> : null}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: colors.card, borderRadius: 10, padding: space.lg, gap: space.sm },
  previewLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
