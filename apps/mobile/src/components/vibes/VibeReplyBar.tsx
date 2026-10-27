import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { DM_MAX, sendDm } from '../../lib/api';
import { notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { colors, fonts, space } from '../../theme';
import { Spinner } from '../Spinner';
import { showToast } from '../Toast';

/**
 * Responder a vibe por mensagem (como no Story): a caixa embaixo da vibe; escrevendo, a vibe
 * pausa e a caixa sobe junto com o teclado. A mensagem vai para a conversa com quem postou,
 * com a vibe em miniatura.
 */
export function VibeReplyBar({
  author,
  username,
  vibeId,
  left,
  width,
  bottom,
  onTyping,
}: {
  author: string;
  username: string;
  vibeId: string;
  left: number;
  width: number;
  /** Distância do fim da tela com o teclado fechado. */
  bottom: number;
  onTyping: (typing: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ bottom: Math.max(bottom, keyboard.height.value + space.sm) }));

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendDm(text, { to: author }, vibeId);
      setBody('');
      Keyboard.dismiss();
      onTyping(false);
      showToast(t('messages.replySent', { username }));
      void qc.invalidateQueries({ queryKey: ['dm'] });
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Animated.View style={[styles.bar, { left, width }, lift]}>
      <TextInput
        testID="vibe-reply-input"
        value={body}
        onChangeText={setBody}
        onFocus={() => onTyping(true)}
        onBlur={() => !body.trim() && onTyping(false)}
        placeholder={t('messages.replyTo', { username })}
        placeholderTextColor="rgba(255,255,255,0.75)"
        accessibilityLabel={t('messages.replyTo', { username })}
        maxLength={DM_MAX}
        returnKeyType="send"
        onSubmitEditing={send}
        style={styles.input}
      />
      {body.trim() ? (
        <Pressable
          testID="vibe-reply-send"
          accessibilityRole="button"
          accessibilityLabel={t('messages.send')}
          disabled={sending}
          onPress={send}
          hitSlop={8}
          style={styles.send}
        >
          {sending ? <Spinner size={16} color={colors.text} /> : <Ionicons name="paper-plane" size={18} color={colors.text} />}
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: space.lg,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
