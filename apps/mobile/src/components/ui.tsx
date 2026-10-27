import { Image } from "expo-image";
import { type ReactNode, type Ref, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { avatarUrl } from "../lib/avatar";
import { colors, fonts, glass, gradients, radius, space, text } from "../theme";
import { Reactive } from "./Reactive";
import { Spinner } from "./Spinner";

/**
 * Teclado: a tela encolhe o tamanho dele, para o campo de texto ficar logo acima.
 * No Android (tela de ponta a ponta) a janela não encolhe sozinha, então é 'padding' nos dois.
 */
export const keyboardBehavior = Platform.OS === "web" ? undefined : "padding";

/** Envolve a tela para subir o conteúdo quando o teclado abre. */
export function KeyboardView({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={keyboardBehavior}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/** Teclado aberto? (para tirar o espaço da barra de gestos embaixo enquanto ele está aberto). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <KeyboardView>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, style]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, { flex: 1 }, style]}>{children}</View>
        )}
      </KeyboardView>
    </SafeAreaView>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  testID,
  size = "md",
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
  size?: "md" | "sm";
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Reactive
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      hoverScale={inactive ? 1 : 1.02}
      style={({ pressed, hovered }) => [
        styles.button,
        size === "sm" && styles.buttonSm,
        styles[variant],
        hovered && !inactive && hoverStyles[variant],
        inactive && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <Spinner
          size={20}
          color={variant === "secondary" ? colors.background : colors.text}
        />
      ) : (
        <View style={styles.buttonRow}>
          {icon}
          <Text
            style={[
              styles.buttonText,
              size === "sm" && { fontSize: 12 },
              variant === "secondary" && styles.buttonTextLight,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Reactive>
  );
}

/** Web: o botão clareia um pouco com o mouse em cima. */
const hoverStyles: Record<ButtonVariant, ViewStyle> = Platform.select({
  web: {
    primary: { filter: "brightness(1.1)" } as ViewStyle,
    secondary: { filter: "brightness(0.94)" } as ViewStyle,
    ghost: { backgroundColor: glass.hover },
    danger: { filter: "brightness(1.08)" } as ViewStyle,
  },
  default: { primary: {}, secondary: {}, ghost: {}, danger: {} },
})!;

export function TextField({
  label,
  hint,
  error,
  success,
  accessory,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  success?: string | null;
  /** Elemento dentro do campo, à direita e centralizado na vertical (ex.: o olho da senha). */
  accessory?: ReactNode;
  /** Referência do TextInput, para passar o foco de um campo ao outro. */
  inputRef?: Ref<TextInputInstance>;
}) {
  // Campo em foco: a borda fica roxa e ganha um brilho (como o resto do vidro, reage ao toque).
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View>
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={label}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            styles.input,
            focused && styles.inputFocused,
            !!accessory && { paddingRight: 48 },
            !!error && { borderColor: colors.danger },
            !!success && { borderColor: colors.success },
            props.style,
          ]}
        />
        {accessory ? <View style={styles.fieldAccessory}>{accessory}</View> : null}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[text.small, { color: colors.danger }]}
        >
          {error}
        </Text>
      ) : success ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[text.small, { color: colors.success }]}
        >
          {success}
        </Text>
      ) : hint ? (
        <Text style={text.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Reactive
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      pressScale={0.94}
      hoverScale={1.04}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[text.small, { color: colors.text }]}>{label}</Text>
    </Reactive>
  );
}

/** `path` é o caminho guardado no perfil (avatars/{id}/...); a URL é montada em lib/avatar. */
export function Avatar({
  uri: path,
  name,
  size = 40,
}: {
  uri: string | null;
  name: string;
  size?: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const uri = avatarUrl(path);
  return uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          color: colors.text,
          fontSize: size * 0.4,
        }}
      >
        {initial}
      </Text>
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
            <Text
              style={[styles.segmentText, selected && { color: colors.text }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text
      accessibilityRole="alert"
      style={[text.small, { color: colors.danger }]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSm: { minHeight: 32, paddingHorizontal: 28, alignSelf: "flex-end" },
  buttonTextLight: {
    color: colors.background,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  fieldLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text,
    marginLeft: 14,
  },
  buttonRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  // Degradê roxo com um brilho embaixo (o botão "flutua" sobre o vidro).
  primary: {
    backgroundColor: colors.primary,
    backgroundImage: gradients.primary,
    boxShadow: "0 6px 18px rgba(104, 94, 255, 0.32)",
  },
  secondary: { backgroundColor: colors.text },
  ghost: { ...glass.chip },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5, boxShadow: "none" },
  pressed: { opacity: 0.92 },
  buttonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  // Figma: campo 48 px, borda branca de 1 px, raio 10, sem fundo.
  fieldAccessory: { position: "absolute", top: 0, bottom: 0, right: 0, justifyContent: "center", paddingRight: space.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    outlineWidth: 0, // Web: sem o contorno branco do navegador; a borda colorida mostra o estado
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: "rgba(104, 94, 255, 0.08)",
    boxShadow: "0 0 0 3px rgba(104, 94, 255, 0.22)",
  },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    ...glass.chip,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    backgroundImage: gradients.primary,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  segmented: {
    flexDirection: "row",
    ...glass.card,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segmentSelected: {
    backgroundColor: colors.primary,
    backgroundImage: gradients.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textMutedOnSurface,
  },
  avatarFallback: {
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * Fundo escuro de um menu que sobe de baixo: tocar fora fecha. O fundo é uma camada atrás do
 * menu (não em volta dele), porque na web um botão não pode ter outros botões dentro.
 */
export function SheetBackdrop({ onClose, label, style, children }: { onClose: () => void; label: string; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={style}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={label} />
      {children}
    </View>
  );
}

