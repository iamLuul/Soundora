import { reportReasonSchema, type ReportReason } from '@soundhora/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { canCreateVibes } from '../lib/vibes-create';
import { colors, fonts, radius, space, text } from '../theme';
import { SheetBackdrop } from './ui';

export type PostAction = { type: 'report'; reason: ReportReason } | { type: 'block' } | { type: 'delete' } | { type: 'vibe' } | { type: 'removeFromCommunity' };

/**
 * Menu "…" de um post: denunciar, bloquear o autor ou apagar o próprio post.
 * Feito com Modal para funcionar igual em Android, iOS e Web.
 */
export function PostActions({
  visible,
  username,
  isMine,
  onClose,
  onAction,
  allowVibe = true,
  deleteLabel,
  canModerate = false,
}: {
  /** Moderador da comunidade do post: pode remover o post dela. */
  canModerate?: boolean;
  /** Compartilhar no Vibes (só posts). */
  allowVibe?: boolean;
  /** Texto de "apagar" (padrão: apagar post). */
  deleteLabel?: string;
  visible: boolean;
  username: string;
  isMine: boolean;
  onClose: () => void;
  onAction: (action: PostAction) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'menu' | 'reasons'>('menu');

  const close = () => {
    setStep('menu');
    onClose();
  };
  const pick = (action: PostAction) => {
    setStep('menu');
    onAction(action);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <SheetBackdrop style={styles.backdrop} onClose={close} label={t('common.cancel')}>
        <View style={styles.sheet}>
          {step === 'menu' ? (
            <>
              {allowVibe && canCreateVibes ? <Option label={t('vibes.shareToVibes')} onPress={() => pick({ type: 'vibe' })} /> : null}
              {canModerate && !isMine ? (
                <Option label={t('communities.removePost')} danger onPress={() => pick({ type: 'removeFromCommunity' })} />
              ) : null}
              {isMine ? (
                <Option label={deleteLabel ?? t('feed.delete')} danger onPress={() => pick({ type: 'delete' })} />
              ) : (
                <>
                  <Option label={t('feed.report')} onPress={() => setStep('reasons')} />
                  <Option label={t('feed.block', { username })} danger onPress={() => pick({ type: 'block' })} />
                </>
              )}
            </>
          ) : (
            <>
              <Text style={[text.label, { padding: space.md }]}>{t('report.title')}</Text>
              {reportReasonSchema.options.map((reason) => (
                <Option key={reason} label={t(`report.${reason}`)} onPress={() => pick({ type: 'report', reason })} />
              ))}
            </>
          )}
          <Option label={t('common.cancel')} onPress={close} />
        </View>
      </SheetBackdrop>
    </Modal>
  );
}

function Option({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.optionText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.sm, paddingBottom: space.xxl },
  option: { padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
