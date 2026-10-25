import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ErrorState } from '../../components/ErrorState';
import { SettingsRow, SettingsScreen, SettingsSection } from '../../components/Settings';
import { Button, ErrorText } from '../../components/ui';
import { clearSearchHistory, fetchSearchHistory, setSearchHistoryEnabled, type SearchHistory } from '../../lib/api';
import { confirmAction } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { relativeTime } from '../../lib/i18n';
import { keys } from '../../lib/queries';
import { colors, fonts, space, text } from '../../theme';

export const searchHistoryKey = ['search-history'] as const;

/**
 * Configurações › Privacidade › Histórico de pesquisas: o que foi guardado (só os termos, por
 * 90 dias), apagar um ou todos, e desligar (desligar também apaga). Só a própria pessoa vê.
 */
export default function SearchHistoryScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const history = useQuery({ queryKey: searchHistoryKey, queryFn: fetchSearchHistory, staleTime: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = history.data?.enabled ?? false;
  const items = history.data?.items ?? [];

  const run = async (key: string, action: () => Promise<void>, update: (old: SearchHistory) => SearchHistory) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      qc.setQueryData<SearchHistory>(searchHistoryKey, (old) => (old ? update(old) : old));
      // O gosto mudou: o Para você e as reviews se recalculam na próxima vez.
      void qc.invalidateQueries({ queryKey: keys.reviewsForYou });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (next: boolean) => {
    if (!next && items.length && !(await confirmAction(t('searchHistory.offConfirm'), t('searchHistory.turnOff'), t('common.cancel')))) return;
    await run(
      'toggle',
      () => setSearchHistoryEnabled(next),
      (old) => ({ enabled: next, items: next ? old.items : [] }),
    );
  };

  const clearAll = async () => {
    if (!(await confirmAction(t('searchHistory.clearConfirm'), t('searchHistory.clear'), t('common.cancel')))) return;
    await run(
      'all',
      () => clearSearchHistory(),
      (old) => ({ ...old, items: [] }),
    );
  };

  return (
    <SettingsScreen title={t('searchHistory.title')}>
      <SettingsSection note={t('searchHistory.hint')}>
        <SettingsRow
          testID="search-history-row"
          icon="search-outline"
          label={t('searchHistory.use')}
          right={
            <Switch
              testID="search-history-switch"
              value={enabled}
              onValueChange={toggle}
              disabled={!history.data || busy !== null}
              trackColor={{ true: colors.primary, false: colors.surface }}
              accessibilityLabel={t('searchHistory.use')}
            />
          }
          last
        />
      </SettingsSection>
      <ErrorText>{error}</ErrorText>

      {history.isError ? (
        <ErrorState message={formatError(t, history.error)} onRetry={() => history.refetch()} />
      ) : !history.data ? null : !items.length ? (
        <Text testID="search-history-empty" style={[text.small, styles.empty]}>
          {enabled ? t('searchHistory.empty') : t('searchHistory.off')}
        </Text>
      ) : (
        <View style={{ gap: space.sm }}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('searchHistory.saved', { count: items.length })}
          </Text>
          <View style={styles.card}>
            {items.map((item, i) => (
              <View key={item.term} testID={`search-term-${item.term}`} style={[styles.row, i === items.length - 1 && { borderBottomWidth: 0 }]}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.term} numberOfLines={1}>
                    {item.term}
                  </Text>
                  <Text style={styles.when}>{relativeTime(item.searched_at)}</Text>
                </View>
                <Pressable
                  testID={`search-term-remove-${item.term}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('searchHistory.remove', { term: item.term })}
                  hitSlop={10}
                  disabled={busy !== null}
                  onPress={() =>
                    run(
                      item.term,
                      () => clearSearchHistory(item.term),
                      (old) => ({ ...old, items: old.items.filter((x) => x.term !== item.term) }),
                    )
                  }
                  style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </Pressable>
              </View>
            ))}
          </View>
          <Button testID="search-history-clear" variant="secondary" title={t('searchHistory.clear')} onPress={clearAll} loading={busy === 'all'} />
        </View>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textMuted, textAlign: 'center' },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: space.xs },
  card: { backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  term: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  when: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  remove: { padding: space.xs },
});
