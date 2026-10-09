import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { relativeTime } from '../lib/i18n';
import type { FeedItem } from '../lib/types';
import { colors, fonts, space, text } from '../theme';
import { MusicCard } from './MusicCard';
import { Avatar } from './ui';

export interface PostCardProps {
  item: FeedItem;
  onToggleLike: (item: FeedItem) => void;
  onMore?: (item: FeedItem) => void;
  onOpenComments?: (item: FeedItem) => void;
  onOpenLink?: (url: string) => void;
}

export function PostCard({ item, onToggleLike, onMore, onOpenComments, onOpenLink }: PostCardProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.post} testID={`post-${item.id}`}>
      <View style={styles.header}>
        <Link href={`/u/${item.author_username}`} asChild>
          <Pressable style={styles.author} accessibilityRole="link">
            <Avatar uri={item.author_avatar_url} name={item.author_display_name} />
            <View>
              <Text style={styles.name}>{item.author_display_name}</Text>
              <Text style={text.small}>
                @{item.author_username} · {relativeTime(item.created_at)}
              </Text>
            </View>
          </Pressable>
        </Link>
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel="…" hitSlop={12} onPress={() => onMore(item)}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {item.body ? <Text style={text.body}>{item.body}</Text> : null}

      <MusicCard
        onOpen={onOpenLink}
        data={{
          url: item.preview_url,
          platform: item.preview_platform,
          title: item.preview_title,
          artist: item.preview_artist,
          imageUrl: item.preview_image_url,
        }}
      />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.liked_by_me ? t('feed.unlike') : t('feed.like')}
          accessibilityState={{ selected: item.liked_by_me }}
          onPress={() => onToggleLike(item)}
          style={styles.action}
          hitSlop={8}
        >
          <Ionicons name={item.liked_by_me ? 'heart' : 'heart-outline'} size={20} color={item.liked_by_me ? colors.primary : colors.muted} />
          <Text style={text.small}>{item.like_count}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('feed.comments')}
          onPress={() => onOpenComments?.(item)}
          style={styles.action}
          hitSlop={8}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.muted} />
          <Text style={text.small}>{item.comment_count}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  actions: { flexDirection: 'row', gap: space.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
