import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '../theme';

/** Grupo de opções com título (ex.: "Conta", "Preferências"), no cartão do perfil. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** Linha de configuração: ícone, nome, valor atual e seta (ou um controle à direita). */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  danger,
  right,
  testID,
  last,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  testID?: string;
  last?: boolean;
}) {
  const color = danger ? colors.danger : colors.text;
  const content = (
    <>
      <Ionicons name={icon} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </>
  );
  const rowStyle = [styles.row, !last && styles.divider];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: space.xs },
  card: { backgroundColor: colors.card, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56, paddingVertical: space.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  value: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMutedOnSurface, marginTop: 2 },
});
