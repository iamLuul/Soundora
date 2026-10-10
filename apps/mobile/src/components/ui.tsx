import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarUrl } from '../lib/avatar';
import { colors, fonts, radius, space, text } from '../theme';

export function Screen({ children, scroll = false, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  testID?: string;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.button, styles[variant], inactive && styles.disabled, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.background : colors.text} />
      ) : (
        <View style={styles.buttonRow}>
          {icon}
          <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.background }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  hint,
  error,
  success,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string | null; success?: string | null }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={text.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, !!error && { borderColor: colors.danger }, !!success && { borderColor: colors.success }, props.style]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[text.small, { color: colors.danger }]}>
          {error}
        </Text>
      ) : success ? (
        <Text accessibilityLiveRegion="polite" style={[text.small, { color: colors.success }]}>
          {success}
        </Text>
      ) : hint ? (
        <Text style={text.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[text.small, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** `path` é o caminho guardado no perfil (avatars/{id}/...); a URL é montada em lib/avatar. */
export function Avatar({ uri: path, name, size = 40 }: { uri: string | null; name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const uri = avatarUrl(path);
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

/** Seletor de seções (ex.: Descobrir | Em alta | Buscar). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={[text.small, { color: colors.danger }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.lg },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.text },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.04)',
    outlineWidth: 0, // Web: sem o contorno branco do navegador; a borda colorida mostra o estado
  },
  chip: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: space.sm, borderRadius: radius.pill, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },
  avatarFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
