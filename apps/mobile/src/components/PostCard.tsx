import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { exactTime, relativeTime } from '../lib/i18n';
import { genreLabel, useGenres } from '../lib/queries';
import type { FeedItem } from '../lib/types';
import { colors, fonts, space } from '../theme';
import { Icon, RingAvatar } from './figma';
import { MentionText } from './MentionText';
import { MusicCard } from './MusicCard';
import { PostMedia } from './PostMedia';
import { webTouch } from '../lib/touch';
import { Verified } from './Verified';

export interface PostCardProps {
  item: FeedItem;
  onToggleLike: (item: FeedItem) => void;
  onMore?: (item: FeedItem) => void;
  onOpenComments?: (item: FeedItem) => void;
  onOpenLink?: (url: string) => void;
  /** Tocar no post (texto/área livre) abre ele em tela cheia. */
  onOpen?: (item: FeedItem) => void;
  /** Post aberto: texto maior e sem a linha de baixo. */
  expanded?: boolean;
  /** Botão "Seguir" ao lado do menu (só quando eu ainda não sigo o autor). */
  onFollow?: (item: FeedItem) => void;
}

/** Post no layout do Figma (Home page/For You): autor, texto, cartão da música e ações. */
export function PostCard({ item, onToggleLike, onMore, onOpenComments, onOpenLink, onOpen, expanded = false, onFollow }: PostCardProps) {
  const { t, i18n } = useTranslation();
  const genres = useGenres();
  const share = () => {
    const music = item.preview_url ? `${item.preview_title}${item.preview_artist ? ` · ${item.preview_artist}` : ''}\n${item.preview_url}` : '';
    const message = [item.body, music].filter(Boolean).join('\n\n') || `@${item.author_username}`;
    Share.share({ message }).catch(() => undefined);
  };

  return (
    <Pressable
      testID={`post-${item.id}`}
      onPress={onOpen ? () => onOpen(item) : undefined}
      disabled={!onOpen}
      // Na web, role "button" vira <button>, e o post tem outros botões dentro (HTML não deixa).
      accessibilityRole={onOpen && Platform.OS !== 'web' ? 'button' : undefined}
      accessibilityHint={onOpen ? t('post.openHint') : undefined}
      style={[styles.post, expanded && styles.expanded]}
    >
      <View style={styles.header}>
        <Link href={`/u/${item.author_username}`} asChild>
          <Pressable style={styles.author} accessibilityRole="link">
            <RingAvatar uri={item.author_avatar_url} name={item.author_display_name} size={38} />
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                  {item.author_display_name}
                </Text>
                <Verified username={item.author_username} />
              </View>
              <Text style={styles.handle} numberOfLines={1}>
                @{item.author_username}
              </Text>
            </View>
          </Pressable>
        </Link>
        {onFollow ? (
          <Pressable
            testID={`follow-${item.author_username}`}
            accessibilityRole="button"
            accessibilityLabel={t('feed.followUser', { username: item.author_username })}
            onPress={() => onFollow(item)}
            hitSlop={8}
            style={({ pressed }) => [styles.follow, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.followText}>{t('feed.follow')}</Text>
          </Pressable>
        ) : null}
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('feed.postOptions')} hitSlop={12} onPress={() => onMore(item)} style={[styles.more, webTouch(12, { vertical: 2, horizontal: space.sm })]}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </Pressable>
        ) : null}
      </View>

      {item.body ? (
        <MentionText style={[styles.body, expanded && styles.bodyBig]} numberOfLines={expanded ? undefined : 8}>
          {item.body}
        </MentionText>
      ) : null}

      <PostMedia media={item.media ?? []} />

      {item.preview_url && item.preview_platform && item.preview_title ? (
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
      ) : null}

      {item.genres?.length ? (
        <View style={styles.genres}>
          {item.genres.map((g) => (
            <View key={g} style={styles.genre}>
              <Text style={styles.genreText}>{genreLabel(genres.data, g, i18n.language) ?? g}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.liked_by_me ? t('feed.unlike') : t('feed.like')}
          accessibilityState={{ selected: item.liked_by_me }}
          onPress={() => onToggleLike(item)}
          style={[styles.action, webTouch(10)]}
          hitSlop={10}
        >
          <Icon name={item.liked_by_me ? 'heartFilled' : 'heart'} size={14} color={item.liked_by_me ? colors.primary : colors.text} />
          <Text style={styles.count}>{item.like_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('feed.comments')} onPress={() => onOpenComments?.(item)} style={[styles.action, webTouch(10)]} hitSlop={10}>
          <Icon name="comment" size={13} />
          <Text style={styles.count}>{item.comment_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('feed.share')} onPress={share} style={[styles.action, webTouch(10)]} hitSlop={10}>
          <Icon name="share" size={13} />
        </Pressable>
        {/* No feed, há quanto tempo; com o post aberto, a data e a hora exatas. */}
        <Text testID="post-time" style={styles.time} numberOfLines={1}>
          {expanded ? exactTime(item.created_at) : relativeTime(item.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  follow: { marginLeft: 'auto', backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 14, height: 28, justifyContent: 'center' },
  followText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  post: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  more: { gap: 2, paddingHorizontal: space.sm, paddingVertical: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.text },
  expanded: { borderBottomWidth: 0 },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text },
  bodyBig: { fontSize: 16, lineHeight: 23 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  genre: { borderRadius: 10, borderWidth: 1, borderColor: colors.handle, paddingHorizontal: space.sm, paddingVertical: 2 },
  genreText: { fontFamily: fonts.regular, fontSize: 10, color: colors.textMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  time: { marginLeft: 'auto', fontFamily: fonts.regular, fontSize: 10, color: colors.text },
});
