import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { relativeTime } from '../lib/i18n';
import type { CommentRow } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { Icon, RingAvatar } from './figma';
import { MentionText } from './MentionText';
import { webTouch } from '../lib/touch';

/** Avatar do comentário (34) e da resposta (28). */
const ROOT_AVATAR = 34;
const REPLY_AVATAR = 28;

/**
 * Comentário (ou resposta, recuada) com curtir e responder. As respostas ficam presas ao
 * comentário por uma linha vertical que desce do avatar dele; a divisória só vem depois da
 * última resposta. `continues` = a próxima linha da lista é resposta deste mesmo comentário.
 */
export function CommentItem({
  item,
  onToggleLike,
  onReply,
  continues = false,
}: {
  item: CommentRow;
  onToggleLike: (item: CommentRow) => void;
  onReply: (item: CommentRow) => void;
  continues?: boolean;
}) {
  const { t } = useTranslation();
  const isReply = !!item.parent_id;
  return (
    <View style={[styles.row, isReply && styles.reply, continues ? styles.threadOpen : styles.threadEnd]} testID={`comment-${item.id}`}>
      {/* Linha da conversa: do avatar do comentário até a última resposta. */}
      {!isReply && continues ? <View testID={`thread-line-${item.id}`} style={[styles.line, { top: space.md + ROOT_AVATAR + 4, bottom: 0 }]} /> : null}
      {isReply ? (
        <View testID={`thread-line-${item.id}`} style={[styles.line, continues ? { top: 0, bottom: 0 } : { top: 0, height: space.sm + REPLY_AVATAR / 2 }]} />
      ) : null}
      <Pressable accessibilityRole="link" accessibilityLabel={`@${item.author_username}`} onPress={() => router.push(`/u/${item.author_username}`)}>
        <RingAvatar uri={item.author_avatar_url} name={item.author_display_name} size={isReply ? REPLY_AVATAR : ROOT_AVATAR} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.author_display_name} <Text style={styles.handle}>@{item.author_username} · {relativeTime(item.created_at)}</Text>
        </Text>
        <MentionText style={styles.body}>{item.body}</MentionText>
        <View style={styles.actions}>
          <Pressable testID={`comment-reply-${item.id}`} accessibilityRole="button" onPress={() => onReply(item)} hitSlop={8} style={webTouch(8)}>
            <Text style={styles.action}>{t('post.reply')}</Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        testID={`comment-like-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={item.liked_by_me ? t('feed.unlike') : t('feed.like')}
        accessibilityState={{ selected: item.liked_by_me }}
        onPress={() => onToggleLike(item)}
        hitSlop={10}
        style={[styles.like, webTouch(10, { top: 2 })]}
      >
        <Icon name={item.liked_by_me ? 'heartFilled' : 'heart'} size={14} color={item.liked_by_me ? colors.primary : colors.textMuted} />
        {item.like_count > 0 ? <Text style={styles.count}>{item.like_count}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  reply: { paddingLeft: 46, paddingTop: space.sm },
  // Fim da conversa: divisória embaixo. Conversa continua: sem divisória e mais perto da resposta.
  threadEnd: { borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  threadOpen: { paddingBottom: space.sm },
  toggleRow: { paddingLeft: 46, paddingTop: space.sm, paddingBottom: space.md },
  toggle: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  // Centro do avatar do comentário (34 / 2) menos metade da largura da linha.
  line: { position: 'absolute', left: ROOT_AVATAR / 2 - 1, width: 2, borderRadius: 1, backgroundColor: colors.surface },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  actions: { flexDirection: 'row', gap: space.lg },
  action: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted },
  like: { alignItems: 'center', gap: 2, paddingTop: 2, minWidth: 24 },
  count: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
});

/** "Ver mais N respostas" / "Mostrar menos" no fim de uma conversa grande. */
export function RepliesToggle({ rootId, hidden, expanded, onPress }: { rootId: string; hidden: number; expanded: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.toggleRow, styles.threadEnd]}>
      <View style={[styles.line, { top: 0, height: space.sm + 9 }]} />
      <Pressable testID={`replies-toggle-${rootId}`} accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} hitSlop={8} style={webTouch(8)}>
        <Text style={styles.toggle}>{expanded ? t('post.showLess') : t('post.showMoreReplies', { count: hidden })}</Text>
      </Pressable>
    </View>
  );
}
