import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type TextInputProps } from 'react-native';
import { colors, space } from '../../theme';
import { TextField } from '../ui';

/** Campo de senha com o botão de mostrar/ocultar. */
export function PasswordField({
  label,
  hint,
  error,
  newPassword = false,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string | null; newPassword?: boolean }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextField
        label={label}
        hint={hint}
        error={error}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={newPassword ? 'new-password' : 'password'}
        textContentType={newPassword ? 'newPassword' : 'password'}
        {...props}
      />
      <Ionicons
        name={visible ? 'eye-off' : 'eye'}
        size={20}
        color={colors.muted}
        style={styles.eye}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  eye: { position: 'absolute', right: space.md, top: 31, padding: 4 },
});
