import type { StreamingChoice } from '@soundhora/core';
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { StreamingPicker } from '../../components/StreamingPicker';
import { ErrorText, Screen } from '../../components/ui';
import { setStreamingPlatform } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { keys, useStreamingPlatform } from '../../lib/queries';
import { space, text } from '../../theme';

/** Trocar a plataforma de streaming (as músicas do Trending abrem nela). Salva ao tocar. */
export default function StreamingSettingsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const current = useStreamingPlatform();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (p: StreamingChoice) => {
    setBusy(true);
    setError(null);
    try {
      await setStreamingPlatform(p);
      qc.setQueryData(keys.streamingPlatform, p);
      // O Descobrir e as curtidas mudam de prévia, link e capa.
      for (const queryKey of [['discover-deck'], ['discover-liked'], ['liked-songs']]) void qc.invalidateQueries({ queryKey });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: space.lg }}>
      <Stack.Screen options={{ title: t('settings.streaming') }} />
      <Text style={text.small}>{t('streaming.hint')}</Text>
      <StreamingPicker value={current.data ?? null} onChange={choose} disabled={busy} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
