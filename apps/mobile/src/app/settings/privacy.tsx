import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from 'react-native';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { fetchFollowRequests, fetchMutedGenres, fetchMyAccount, setPrivateAccount } from '../../lib/api';
import { confirmAction, notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { keys } from '../../lib/queries';
import { colors } from '../../theme';
import { myAccountKey } from './account';

export const mutedGenresKey = ['muted-genres'] as const;

/** Configurações › Privacidade: conta privada, pedidos para seguir, bloqueados e gêneros silenciados. */
export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const account = useQuery({ queryKey: myAccountKey, queryFn: fetchMyAccount });
  const requests = useQuery({ queryKey: keys.followRequests, queryFn: fetchFollowRequests });
  const muted = useQuery({ queryKey: mutedGenresKey, queryFn: fetchMutedGenres });
  const [busy, setBusy] = useState(false);
  const isPrivate = account.data?.is_private ?? false;
  const pending = requests.data?.length ?? 0;

  const togglePrivate = async (next: boolean) => {
    if (!(await confirmAction(t(next ? 'settings.privateOnConfirm' : 'settings.privateOffConfirm'), t('common.confirm'), t('common.cancel')))) return;
    setBusy(true);
    try {
      await setPrivateAccount(next);
      qc.setQueryData(myAccountKey, (old: typeof account.data) => (old ? { ...old, is_private: next } : old));
      for (const queryKey of [keys.followRequests, ['profile'], ['people']]) void qc.invalidateQueries({ queryKey });
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsScreen title={t('settings.catPrivacy')}>
      <SettingsSection note={t('settings.privateHint')}>
        <SettingsRow
          testID="settings-private"
          icon="lock-closed-outline"
          label={t('settings.private')}
          right={
            <Switch
              testID="settings-private-switch"
              value={isPrivate}
              onValueChange={togglePrivate}
              disabled={busy || !account.data}
              trackColor={{ true: colors.primary, false: colors.surface }}
              accessibilityLabel={t('settings.private')}
            />
          }
          last={!isPrivate && !pending}
        />
        {isPrivate || pending ? (
          <SettingsRow
            testID="settings-requests"
            icon="person-add-outline"
            label={t('settings.requests')}
            value={pending ? t('settings.requestsCount', { count: pending }) : t('settings.requestsNone')}
            onPress={() => router.push('/settings/follow-requests')}
            last
          />
        ) : null}
      </SettingsSection>

      <SettingsSection>
        <SettingsRow
          testID="settings-blocked"
          icon="ban-outline"
          label={t('settings.blocked')}
          value={t('settings.blockedHint')}
          onPress={() => router.push('/settings/blocked')}
        />
        <SettingsRow
          testID="settings-muted"
          icon="volume-mute-outline"
          label={t('settings.muted')}
          value={muted.data?.length ? t('settings.mutedCount', { count: muted.data.length }) : t('settings.mutedHint')}
          onPress={() => router.push('/settings/muted-genres')}
          last
        />
      </SettingsSection>
    </SettingsScreen>
  );
}
