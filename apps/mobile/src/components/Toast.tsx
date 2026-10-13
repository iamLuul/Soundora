import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, space } from '../theme';

/** Quanto tempo o aviso fica na tela. */
export const TOAST_MS = 2600;

type ToastKind = 'success' | 'info';
interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

let nextId = 1;
const listeners = new Set<(m: ToastMessage) => void>();

/**
 * Aviso curto que some sozinho ("Review publicada", "Denúncia enviada"). Não bloqueia a tela
 * como um alerta e é lido pelo leitor de tela.
 */
export function showToast(text: string, kind: ToastKind = 'success') {
  const message = { id: nextId++, text, kind };
  for (const l of listeners) l(message);
  AccessibilityInfo.announceForAccessibility?.(text);
}

/** Fica no topo do app (no layout raiz) e mostra os avisos, um de cada vez. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMessage = (m: ToastMessage) => {
      setCurrent(m);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => setCurrent((c) => (c?.id === m.id ? null : c)));
      }, TOAST_MS);
    };
    listeners.add(onMessage);
    return () => {
      listeners.delete(onMessage);
      if (timer) clearTimeout(timer);
    };
  }, [opacity]);

  if (!current) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <Animated.View testID="toast" accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.toast, { opacity }]}>
        <Ionicons name={current.kind === 'success' ? 'checkmark-circle' : 'information-circle'} size={18} color={current.kind === 'success' ? colors.success : colors.text} />
        <Text style={styles.text}>{current.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});
