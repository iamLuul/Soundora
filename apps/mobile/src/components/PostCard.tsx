import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { relativeTime } from '../lib/i18n';
import type { FeedItem } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { Icon, RingAvatar } from './figma';
import { MusicCard } from './MusicCard';

export interface PostCardProps {
  item: FeedItem;
  onToggleLike: (item: FeedItem) => void;
  onMore?: (item: FeedItem) => void;
  onOpenComments?: (item: FeedItem) => void;
  onOpenLink?: (url: string) => void;
}

/** Post no layout do Figma (Home page/For You): autor, texto, cartão da música e ações. */
export function PostCard({ item, onToggleLike, onMore, onOpenComments, onOpenLink }: PostCardProps) {
  const { t } = useTranslation();
  const share = () =>
    Share.share({ message: `${item.preview_title}${item.preview_artist ? ` · ${item.preview_artist}` : ''}\n${item.preview_url}` }).catch(() => undefined);

  return (
    <View style={styles.post} testID={`post-${item.id}`}>
      <View style={styles.header}>
        <Link href={`/u/${item.author_username}`} asChild>
          <Pressable style={styles.author} accessibilityRole="link">
            <RingAvatar uri={item.author_avatar_url} name={item.author_display_name} size={38} />
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.author_display_name}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{item.author_username}
              </Text>
            </View>
          </Pressable>
        </Link>
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('feed.postOptions')} hitSlop={12} onPress={() => onMore(item)} style={styles.more}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </Pressable>
        ) : null}
      </View>

      {item.body ? <Text style={styles.body}>{item.body}</Text> : null}

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
          hitSlop={10}
        >
          <Icon name={item.liked_by_me ? 'heartFilled' : 'heart'} size={14} color={item.liked_by_me ? colors.primary : colors.text} />
          <Text style={styles.count}>{item.like_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('feed.comments')} onPress={() => onOpenComments?.(item)} style={styles.action} hitSlop={10}>
          <Icon name="comment" size={13} />
          <Text style={styles.count}>{item.comment_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('feed.share')} onPress={share} style={styles.action} hitSlop={10}>
          <Icon name="share" size={13} />
        </Pressable>
        <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  more: { gap: 2, paddingHorizontal: space.sm, paddingVertical: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  time: { marginLeft: 'auto', fontFamily: fonts.regular, fontSize: 10, color: colors.text },
});
