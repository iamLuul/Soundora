import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { space } from '../theme';
import { ErrorState } from './ErrorState';
import { Button } from './ui';

/**
 * A pessoa entrou, mas o perfil não carregou. Sem saber se a conta já fez o onboarding, o app
 * não abre o cadastro nem as abas: só tentar de novo ou sair.
 */
export function AccountLoadFailed() {
  const { t } = useTranslation();
  const { refreshProfile, signOut } = useAuth();
  return (
    <View testID="account-load-failed" style={styles.screen}>
      <ErrorState testID="account-load" message={t('auth.accountLoadFailed')} onRetry={refreshProfile} />
      <Button
        testID="account-load-sign-out"
        title={t('auth.signOut')}
        size="sm"
        variant="ghost"
        onPress={() => void signOut()}
        style={{ alignSelf: 'center' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', gap: space.md },
});
