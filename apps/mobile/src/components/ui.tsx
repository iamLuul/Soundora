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

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  testID,
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  testID?: string;
  /** md: 48 px (Figma "Sign in"); sm: 32 px (Figma "Next"). */
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.button, size === 'sm' && styles.buttonSm, styles[variant], inactive && styles.disabled, pressed && styles.pressed, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.background : colors.text} />
      ) : (
        <View style={styles.buttonRow}>
          {icon}
          <Text style={[styles.buttonText, size === 'sm' && { fontSize: 12 }, variant === 'secondary' && styles.buttonTextLight]}>{title}</Text>
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
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
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
  button: { minHeight: 48, borderRadius: 10, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonSm: { minHeight: 32, paddingHorizontal: 28, alignSelf: 'flex-end' },
  buttonTextLight: { color: colors.background, fontFamily: fonts.regular, fontSize: 12 },
  fieldLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, marginLeft: 14 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.text },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  // Figma: campo 48 px, borda branca de 1 px, raio 10, sem fundo.
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    backgroundColor: 'transparent',
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
