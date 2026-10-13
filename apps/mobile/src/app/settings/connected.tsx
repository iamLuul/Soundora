import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '../../components/ErrorState';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { Button } from '../../components/ui';
import { fetchIdentities, linkProvider, unlinkProvider, type LoginProvider } from '../../lib/auth';
import { confirmAction, notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { colors, fonts, space } from '../../theme';

const PROVIDERS: { id: LoginProvider; name: string; icon: 'logo-google' | 'logo-apple' }[] = [
  { id: 'google', name: 'Google', icon: 'logo-google' },
  { id: 'apple', name: 'Apple', icon: 'logo-apple' },
];

/**
 * Configurações › Segurança › Contas conectadas: Google e Apple para entrar. A última forma de
 * entrar não pode ser desconectada (o servidor também recusa). Plataformas de streaming: em breve.
 */
export default function ConnectedAccountsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const identities = useQuery({ queryKey: ['identities'], queryFn: fetchIdentities, staleTime: 0 });
  const [busy, setBusy] = useState<LoginProvider | null>(null);
  const list = identities.data ?? [];
  const has = (p: LoginProvider) => list.some((i) => i.provider === p);

  const toggle = async (p: (typeof PROVIDERS)[number]) => {
    const connected = has(p.id);
    if (connected) {
      if (list.length <= 1) return notify(t('settings.onlyLogin'));
      if (!(await confirmAction(t('settings.disconnectConfirm', { provider: p.name }), t('settings.disconnect'), t('common.cancel')))) return;
    }
    setBusy(p.id);
    try {
      if (connected) await unlinkProvider(p.id);
      else await linkProvider(p.id);
      await qc.invalidateQueries({ queryKey: ['identities'] });
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsScreen title={t('settings.connected')}>
      <SettingsSection note={t('settings.connectedIntro')}>
        {identities.isError ? (
          <ErrorState message={formatError(t, identities.error)} onRetry={() => identities.refetch()} />
        ) : (
          PROVIDERS.map((p, i) => {
            const connected = has(p.id);
            return (
              <SettingsRow
                key={p.id}
                testID={`connected-${p.id}`}
                icon={p.icon}
                label={p.name}
                value={identities.isLoading ? '…' : connected ? t('settings.connectedOn') : t('settings.connectedOff')}
                right={
                  identities.isLoading ? null : (
                    <Button
                      testID={`connected-${p.id}-toggle`}
                      size="sm"
                      variant={connected ? 'ghost' : 'primary'}
                      title={connected ? t('settings.disconnect') : t('settings.connect')}
                      loading={busy === p.id}
                      disabled={!!busy}
                      onPress={() => toggle(p)}
                      style={{ alignSelf: 'auto' }}
                    />
                  )
                }
                last={i === PROVIDERS.length - 1}
              />
            );
          })
        )}
      </SettingsSection>

      <View style={styles.soon}>
        <Ionicons name="musical-notes-outline" size={20} color={colors.textMuted} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.soonTitle}>{t('settings.streamingLinks')}</Text>
          <Text style={styles.soonBody}>{t('settings.streamingLinksBody')}</Text>
        </View>
      </View>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  soon: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  soonTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  soonBody: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted },
});
