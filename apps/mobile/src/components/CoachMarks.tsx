import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { markTipSeen, tipSeen, type TipKey } from '../lib/tips';
import { colors, fonts, glass, radius, space } from '../theme';
import { Button } from './ui';

export interface CoachStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

/** Se a dica ainda não foi vista neste aparelho (e uma função para fechar e não mostrar mais). */
export function useFirstTimeTip(tip: TipKey): [boolean, () => void] {
  const [open, setOpen] = useState(() => !tipSeen(tip));
  return [
    open,
    () => {
      markTipSeen(tip);
      setOpen(false);
    },
  ];
}

/**
 * Passo a passo da primeira vez: um cartão por gesto, com "Próxima" e "Pular". Fecha de vez
 * no último passo ou ao pular.
 */
export function CoachMarks({ visible, steps, onClose, testID = 'coach' }: { visible: boolean; steps: CoachStep[]; onClose: () => void; testID?: string }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  if (!visible || !steps.length) return null;
  const step = steps[Math.min(index, steps.length - 1)]!;
  const last = index >= steps.length - 1;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View testID={testID} style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon} size={28} color={colors.text} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {step.title}
          </Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.dots} accessible accessibilityLabel={t('onboarding.step', { current: index + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
          <View style={styles.actions}>
            {!last ? (
              <Pressable testID={`${testID}-skip`} accessibilityRole="button" onPress={onClose} hitSlop={8}>
                <Text style={styles.skip}>{t('tips.skip')}</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Button
              testID={`${testID}-next`}
              size="sm"
              title={last ? t('tips.done') : t('tips.next')}
              onPress={() => (last ? onClose() : setIndex(index + 1))}
              style={{ alignSelf: 'auto' }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: space.lg },
  card: {
    ...glass.sheet,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.md,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    marginBottom: space.xxl,
  },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.handle },
  dotOn: { width: 18, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  skip: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
});
