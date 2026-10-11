import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { relativeTime } from '../lib/i18n';
import type { CommentRow } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { Icon, RingAvatar } from './figma';

/** Comentário (ou resposta, recuada) com curtir e responder. */
export function CommentItem({
  item,
  onToggleLike,
  onReply,
}: {
  item: CommentRow;
  onToggleLike: (item: CommentRow) => void;
  onReply: (item: CommentRow) => void;
}) {
  const { t } = useTranslation();
  const isReply = !!item.parent_id;
  return (
    <View style={[styles.row, isReply && styles.reply]} testID={`comment-${item.id}`}>
      <Pressable accessibilityRole="link" accessibilityLabel={`@${item.author_username}`} onPress={() => router.push(`/u/${item.author_username}`)}>
        <RingAvatar uri={item.author_avatar_url} name={item.author_display_name} size={isReply ? 28 : 34} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.author_display_name} <Text style={styles.handle}>@{item.author_username} · {relativeTime(item.created_at)}</Text>
        </Text>
        <Text style={styles.body}>{item.body}</Text>
        <View style={styles.actions}>
          <Pressable testID={`comment-reply-${item.id}`} accessibilityRole="button" onPress={() => onReply(item)} hitSlop={8}>
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
        style={styles.like}
      >
        <Icon name={item.liked_by_me ? 'heartFilled' : 'heart'} size={14} color={item.liked_by_me ? colors.primary : colors.textMuted} />
        {item.like_count > 0 ? <Text style={styles.count}>{item.like_count}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  reply: { paddingLeft: 46, borderBottomWidth: 0, paddingTop: 0 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  actions: { flexDirection: 'row', gap: space.lg },
  action: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textMuted },
  like: { alignItems: 'center', gap: 2, paddingTop: 2, minWidth: 24 },
  count: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
});
