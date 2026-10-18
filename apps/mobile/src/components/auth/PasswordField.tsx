import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type TextInputProps } from 'react-native';
import { colors } from '../../theme';
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
        autoComplete={newPassword ? 'new-password' : 'current-password'}
        textContentType={newPassword ? 'newPassword' : 'password'}
        accessory={
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          >
            <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
          </Pressable>
        }
        {...props}
      />
    </View>
  );
}
