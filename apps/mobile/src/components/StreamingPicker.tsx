import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_LABELS, STREAMING_CHOICES, type StreamingChoice } from '@soundora/core';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space } from '../theme';
import { PlatformLogo } from './figma';

/** Lista das plataformas de streaming para a pessoa escolher a sua (cadastro, Configurações, Trending). */
export function StreamingPicker({ value, onChange, disabled }: { value: StreamingChoice | null; onChange: (p: StreamingChoice) => void; disabled?: boolean }) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {STREAMING_CHOICES.map((p) => {
        const selected = value === p;
        return (
          <Pressable
            key={p}
            testID={`streaming-${p}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(p)}
            style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && { opacity: 0.8 }]}
          >
            <PlatformLogo platform={p} size={28} />
            <Text style={styles.label}>{PLATFORM_LABELS[p]}</Text>
            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.primary : colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.card,
  },
  rowOn: { borderColor: colors.primary },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
