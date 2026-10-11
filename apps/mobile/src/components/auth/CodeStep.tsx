import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, space, text } from '../../theme';
import { Button } from '../ui';

export const RESEND_SECONDS = 60;
const LENGTH = 6;

/**
 * Digitar o código de 6 dígitos que chegou no e-mail (Figma: "Confira seu e-mail", 6 caixas
 * de 48 px), com "reenviar" depois de 60 s. Um único campo invisível recebe o texto, então
 * colar o código e o preenchimento automático do celular continuam funcionando.
 */
export function CodeStep({
  destination,
  verifyLabel,
  backLabel,
  verifying,
  onVerify,
  onResend,
  onBack,
}: {
  destination: string;
  verifyLabel: string;
  backLabel: string;
  verifying: boolean;
  onVerify: (code: string) => void;
  /** Reenvia o código; deve lançar erro se falhar (a tela mostra a mensagem). */
  onResend: () => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(true);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const resend = async () => {
    setResending(true);
    setResent(false);
    try {
      await onResend();
      setResent(true);
      setWait(RESEND_SECONDS);
      setCode('');
    } catch {
      // a tela dona do passo já mostra o erro
    } finally {
      setResending(false);
    }
  };

  const submit = () => {
    if (code.length === LENGTH) onVerify(code);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('auth.checkEmail')}</Text>
      <Text style={styles.sub}>{t('auth.codeSentTo', { email: destination })}</Text>

      <Pressable onPress={() => input.current?.focus()} style={styles.boxes} accessible={false}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const active = focused && (i === code.length || (i === LENGTH - 1 && code.length === LENGTH));
          return (
            <View key={i} style={[styles.box, active && styles.boxActive]}>
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={input}
          testID="code-input"
          accessibilityLabel={t('auth.code')}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, LENGTH))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={LENGTH}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          caretHidden
          style={styles.hidden}
        />
      </Pressable>

      <Text
        testID="resend-code"
        style={[styles.resend, (wait > 0 || verifying || resending) && styles.resendOff]}
        onPress={wait > 0 || verifying || resending ? undefined : resend}
        accessibilityRole="button"
        accessibilityState={{ disabled: wait > 0 || verifying || resending }}
      >
        {wait > 0 ? t('auth.resendIn', { seconds: wait }) : t('auth.resend')}
      </Text>
      {resent ? <Text style={[text.small, styles.center, { color: colors.success }]}>{t('auth.codeResent')}</Text> : null}

      <Button testID="verify-code" title={verifyLabel} size="sm" onPress={submit} loading={verifying} disabled={code.length !== LENGTH} />
      <Text style={[text.small, styles.center, styles.link]} onPress={onBack} accessibilityRole="link">
        {backLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, textAlign: 'center' },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.sm },
  box: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2 },
  digit: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  // Fica por cima das caixas, transparente: recebe toque, teclado, colar e preenchimento automático.
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' },
  resend: { fontFamily: fonts.regular, fontSize: 12, color: colors.text, textAlign: 'center', textDecorationLine: 'underline' },
  resendOff: { color: colors.textMuted, textDecorationLine: 'none' },
  center: { textAlign: 'center' },
  link: { textDecorationLine: 'underline' },
});
