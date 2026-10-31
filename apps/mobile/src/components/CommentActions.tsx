import { reportReasonSchema, type ReportReason } from '@soundhora/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, space, text } from '../theme';
import { BottomSheet } from './BottomSheet';

export type CommentAction = { type: 'share' } | { type: 'report'; reason: ReportReason };

/**
 * Menu "…" de um comentário: compartilhar e, nos comentários dos outros, denunciar (com o motivo).
 */
export function CommentActions({
  visible,
  isMine,
  onClose,
  onAction,
}: {
  visible: boolean;
  isMine: boolean;
  onClose: () => void;
  onAction: (action: CommentAction) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'menu' | 'reasons'>('menu');
  const close = () => {
    setStep('menu');
    onClose();
  };
  const pick = (action: CommentAction) => {
    setStep('menu');
    onAction(action);
  };

  return (
    <BottomSheet visible={visible} onClose={close} label={t('common.cancel')}>
      <View testID="comment-actions">
        {step === 'menu' ? (
          <>
            <Option testID="comment-action-share" label={t('post.shareComment')} onPress={() => pick({ type: 'share' })} />
            {isMine ? null : <Option testID="comment-action-report" label={t('post.reportComment')} danger onPress={() => setStep('reasons')} />}
          </>
        ) : (
          <>
            <Text style={[text.label, { padding: space.md }]}>{t('report.title')}</Text>
            {reportReasonSchema.options.map((reason) => (
              <Option key={reason} testID={`comment-report-${reason}`} label={t(`report.${reason}`)} onPress={() => pick({ type: 'report', reason })} />
            ))}
          </>
        )}
        <Option testID="comment-action-cancel" label={t('common.cancel')} onPress={close} />
      </View>
    </BottomSheet>
  );
}

function Option({ label, onPress, danger, testID }: { label: string; onPress: () => void; danger?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.optionText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: { padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
