import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space } from '../theme';

export interface SheetOption {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  danger?: boolean;
}

/** Menu de opções que sobe de baixo (ex.: o "⋮" do perfil). Igual em Android, iOS e Web. */
export function OptionsSheet({ visible, title, options, onClose }: { visible: boolean; title?: string; options: SheetOption[]; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityRole="menu">
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {options.map((o) => (
            <Pressable
              key={o.key}
              testID={`option-${o.key}`}
              accessibilityRole="menuitem"
              onPress={() => {
                onClose();
                o.onPress();
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.card }]}
            >
              <Ionicons name={o.icon} size={20} color={o.danger ? colors.danger : colors.text} />
              <Text style={[styles.optionText, o.danger && { color: colors.danger }]}>{o.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.sm,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.sm },
  title: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, paddingHorizontal: space.lg, paddingVertical: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md },
  optionText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  cancel: { marginTop: space.sm, padding: space.lg, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.card },
  cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
