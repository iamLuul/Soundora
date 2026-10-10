import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, ErrorText, TextField } from '../../components/ui';
import { addComment, fetchComments } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { relativeTime } from '../../lib/i18n';
import { keys } from '../../lib/queries';
import { colors, fonts, space, text } from '../../theme';

export default function PostCommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const comments = useQuery({ queryKey: keys.comments(id), queryFn: () => fetchComments(id) });
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await addComment(id, body);
      setBody('');
      await qc.invalidateQueries({ queryKey: keys.comments(id) });
      await qc.invalidateQueries({ queryKey: keys.feed });
    } catch (err) {
      setError(formatError(t, err));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={comments.data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: space.lg, gap: space.lg }}
        ListEmptyComponent={comments.isLoading ? null : <Text style={[text.body, { color: colors.textMuted }]}>{t('post.noComments')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <Avatar uri={item.author?.avatar_url ?? null} name={item.author?.display_name ?? '?'} size={32} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>
                {item.author?.display_name} <Text style={text.small}>@{item.author?.username} · {relativeTime(item.created_at)}</Text>
              </Text>
              <Text style={text.body}>{item.body}</Text>
            </View>
          </View>
        )}
      />
      <View style={styles.composer}>
        <View style={{ flex: 1 }}>
          <TextField label={t('post.commentPlaceholder')} value={body} onChangeText={setBody} maxLength={300} />
        </View>
        <View style={{ justifyContent: 'flex-end' }}>
          <Button title={t('post.send')} onPress={send} loading={sending} disabled={!body.trim()} />
        </View>
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
        <ErrorText>{error}</ErrorText>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  comment: { flexDirection: 'row', gap: space.md },
  name: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  composer: { flexDirection: 'row', gap: space.sm, padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
