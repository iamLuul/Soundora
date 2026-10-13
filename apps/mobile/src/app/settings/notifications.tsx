import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from 'react-native';
import { ErrorState } from '../../components/ErrorState';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { fetchMutedNotificationKinds, setMutedNotificationKinds, type NotificationKind } from '../../lib/api';
import { notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { disablePush, enablePush, pushAvailability, pushEnabled } from '../../lib/push';
import { colors } from '../../theme';

/** Tipos de aviso agrupados como a pessoa pensa neles (cada grupo liga/desliga junto). */
export const NOTIFICATION_GROUPS: {
  key: string;
  icon: 'heart-outline' | 'chatbubble-outline' | 'return-down-forward-outline' | 'person-add-outline' | 'people-outline';
  kinds: NotificationKind[];
}[] = [
  { key: 'Likes', icon: 'heart-outline', kinds: ['like', 'comment_like', 'review_like'] },
  { key: 'Comments', icon: 'chatbubble-outline', kinds: ['comment', 'reply'] },
  { key: 'Replies', icon: 'return-down-forward-outline', kinds: ['comment_reply'] },
  { key: 'Follows', icon: 'person-add-outline', kinds: ['follow'] },
  { key: 'Requests', icon: 'people-outline', kinds: ['follow_request', 'follow_accepted'] },
];

const mutedKey = ['notification-settings'] as const;

/** Configurações › Notificações: avisos no celular e quais tipos de aviso chegam. */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const muted = useQuery({ queryKey: mutedKey, queryFn: fetchMutedNotificationKinds });

  const toggleGroup = async (kinds: NotificationKind[], on: boolean) => {
    // O valor mais novo do cache (dois toques seguidos não podem usar a lista antiga).
    const before = qc.getQueryData<NotificationKind[]>(mutedKey) ?? [];
    const next = on ? before.filter((k) => !kinds.includes(k)) : [...new Set([...before, ...kinds])];
    qc.setQueryData(mutedKey, next);
    try {
      await setMutedNotificationKinds(next);
    } catch (err) {
      qc.setQueryData(mutedKey, before);
      notify(formatError(t, err));
    }
  };

  return (
    <SettingsScreen title={t('settings.catNotifications')}>
      <SettingsSection title={t('settings.notifDevice')}>
        <PushRow />
      </SettingsSection>

      <SettingsSection title={t('settings.notifTypes')} note={t('settings.notifIntro')}>
        {muted.isError ? (
          <ErrorState message={formatError(t, muted.error)} onRetry={() => muted.refetch()} />
        ) : (
          NOTIFICATION_GROUPS.map((g, i) => {
            const on = !(muted.data ?? []).some((k) => g.kinds.includes(k));
            const hint = t(`settings.notif${g.key}Hint`, { defaultValue: '' });
            return (
              <SettingsRow
                key={g.key}
                testID={`notif-${g.key.toLowerCase()}`}
                icon={g.icon}
                label={t(`settings.notif${g.key}`)}
                value={hint || undefined}
                right={
                  <Switch
                    testID={`notif-${g.key.toLowerCase()}-switch`}
                    value={on}
                    disabled={!muted.data}
                    onValueChange={(v) => toggleGroup(g.kinds, v)}
                    trackColor={{ true: colors.primary, false: colors.surface }}
                    accessibilityLabel={t(`settings.notif${g.key}`)}
                  />
                }
                last={i === NOTIFICATION_GROUPS.length - 1}
              />
            );
          })
        )}
      </SettingsSection>
    </SettingsScreen>
  );
}

/** Liga/desliga o push neste aparelho. */
function PushRow() {
  const { t } = useTranslation();
  const available = pushAvailability();
  const [on, setOn] = useState(pushEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      if (next) {
        const granted = await enablePush();
        setOn(granted);
        if (!granted) setMessage(t('notifications.pushDenied'));
      } else {
        await disablePush();
        setOn(false);
      }
    } catch (err) {
      setMessage(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      testID="settings-push"
      icon="phone-portrait-outline"
      label={t('settings.push')}
      value={!available.ok ? t('settings.pushUnavailable') : (message ?? undefined)}
      right={
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={!available.ok || busy}
          trackColor={{ true: colors.primary, false: colors.surface }}
          accessibilityLabel={t('settings.push')}
        />
      }
      last
    />
  );
}
