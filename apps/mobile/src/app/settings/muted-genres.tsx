import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { ErrorState } from '../../components/ErrorState';
import { GenrePicker } from '../../components/GenrePicker';
import { SettingsScreen } from '../../components/Settings';
import { showToast } from '../../components/Toast';
import { Button, ErrorText } from '../../components/ui';
import { fetchMutedGenres, setMutedGenres } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { colors, text } from '../../theme';
import { mutedGenresKey } from './privacy';

const MAX = 50;

/** Gêneros silenciados: somem do Para você e do Descobrir. */
export default function MutedGenresScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const muted = useQuery({ queryKey: mutedGenresKey, queryFn: fetchMutedGenres });
  // Até a pessoa mexer, vale a lista salva.
  const [edited, setValue] = useState<string[] | null>(null);
  const value = edited ?? muted.data ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await setMutedGenres(value);
      qc.setQueryData(mutedGenresKey, value);
      // O que aparece no Para você e no Descobrir muda.
      for (const queryKey of [['feed'], ['discover-deck']]) void qc.invalidateQueries({ queryKey });
      showToast(t('settings.mutedSaved'));
      router.back();
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsScreen title={t('settings.muted')}>
      <Text style={[text.body, { color: colors.textMuted }]}>{t('settings.mutedIntro')}</Text>
      {muted.isError ? (
        <ErrorState message={formatError(t, muted.error)} onRetry={() => muted.refetch()} />
      ) : value ? (
        <GenrePicker value={value} onChange={setValue} max={MAX} title={t('settings.mutedPick')} />
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button testID="muted-save" title={t('common.save')} onPress={save} loading={busy} disabled={!value} />
    </SettingsScreen>
  );
}
