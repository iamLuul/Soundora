import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader, RingAvatar, SearchField } from '../../components/figma';
import { Spinner } from '../../components/Spinner';
import { Verified } from '../../components/Verified';
import { searchProfiles } from '../../lib/api';
import { openConversationWith } from '../../components/messages/open';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { formatError } from '../../lib/errors';
import { useDebouncedValue } from '../../lib/hooks';
import type { PersonCard } from '../../lib/types';
import { colors, fonts, space, text } from '../../theme';

/** Nova mensagem: buscar a pessoa pelo nome ou @. */
export default function ComposeMessageScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 300);
  const people = useQuery({ queryKey: ['search-people', q], queryFn: () => searchProfiles(q), enabled: q.length >= 2 });
  const list = (people.data ?? []).filter((p) => p.id !== profile?.id && !p.blocked_by_me);
  const [opening, setOpening] = useState<string | null>(null);

  const open = async (p: PersonCard) => {
    setOpening(p.id);
    try {
      await openConversationWith(p, true);
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header">
          {t('messages.new')}
        </Text>
        <SearchField testID="message-search" value={query} onChangeText={setQuery} placeholder={t('messages.searchPeople')} autoFocus />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          people.isFetching ? (
            <Spinner style={{ marginTop: space.xl }} />
          ) : (
            <Text style={[text.body, styles.hint]}>{q.length >= 2 && people.isSuccess ? t('messages.noPeople', { query: q }) : t('messages.searchHint')}</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`message-to-${item.username}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.display_name}, @${item.username}`}
            onPress={() => void open(item)}
            disabled={!!opening}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
          >
            <RingAvatar uri={item.avatar_url} name={item.display_name} size={44} ring={false} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Verified username={item.username} size={12} />
              </View>
              <Text style={styles.handle}>@{item.username}</Text>
            </View>
            {opening === item.id ? <Spinner size={18} /> : null}
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: space.lg, gap: space.md, marginBottom: space.sm },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  hint: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, flexShrink: 1 },
  handle: { fontFamily: fonts.regular, fontSize: 13, color: colors.handle },
});
