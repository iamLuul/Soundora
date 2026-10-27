import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, glass, space } from '../theme';
import { Screen } from './ui';

/** Uma tela de Configurações (título no cabeçalho, coluna centralizada). */
export function SettingsScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: space.xl }}>
      <Stack.Screen options={{ title }} />
      {children}
    </Screen>
  );
}

/** Grupo de opções (com título opcional, ex.: "Neste aparelho"), num cartão. */
export function SettingsSection({ title, children, note }: { title?: string; children: ReactNode; note?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.card}>{children}</View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
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
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        ...rowStyle,
        hovered && { backgroundColor: glass.hover },
        pressed && { backgroundColor: glass.pressed },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** Opção de escolha única (rádio) dentro de um cartão de configurações. */
export function ChoiceRow({
  label,
  selected,
  onPress,
  testID,
  last,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        !last && styles.divider,
        hovered && { backgroundColor: glass.hover },
        pressed && { backgroundColor: glass.pressed },
      ]}
    >
      <Text style={[styles.label, { flex: 1, color: colors.text }]}>{label}</Text>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: space.xs },
  card: { ...glass.card, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56, paddingVertical: space.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  value: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMutedOnSurface, marginTop: 2 },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginHorizontal: space.xs },
});
