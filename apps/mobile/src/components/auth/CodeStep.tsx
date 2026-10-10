import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { colors, text } from '../../theme';
import { Button, TextField } from '../ui';

export const RESEND_SECONDS = 60;

/** Digitar o código de 6 dígitos que chegou no e-mail, com "reenviar" depois de 60 s. */
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
  const [code, setCode] = useState('');
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
    if (code.length === 6) onVerify(code);
  };

  return (
    <>
      <Text style={text.body}>{t('auth.codeSentTo', { email: destination })}</Text>
      <TextField
        testID="code-input"
        label={t('auth.code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        onSubmitEditing={submit}
        autoFocus
      />
      <Button testID="verify-code" title={verifyLabel} onPress={submit} loading={verifying} disabled={code.length !== 6} />
      <Button
        testID="resend-code"
        title={wait > 0 ? t('auth.resendIn', { seconds: wait }) : t('auth.resend')}
        variant="ghost"
        onPress={resend}
        loading={resending}
        disabled={wait > 0 || verifying}
      />
      {resent ? <Text style={[text.small, { color: colors.success }]}>{t('auth.codeResent')}</Text> : null}
      <Text style={[text.small, { textAlign: 'center', textDecorationLine: 'underline' }]} onPress={onBack} accessibilityRole="link">
        {backLabel}
      </Text>
    </>
  );
}
