import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { exactTime, relativeTime } from '../lib/i18n';
import { genreLabel, useGenres } from '../lib/queries';
import type { FeedItem } from '../lib/types';
import { colors, fonts, glass, gradients, space } from '../theme';
import Animated from 'react-native-reanimated';
import { Reactive, usePop } from './Reactive';
import { Icon, RingAvatar } from './figma';
import { MentionText } from './MentionText';
import { MusicCard } from './MusicCard';
import { PostMedia } from './PostMedia';
import { webTouch } from '../lib/touch';
import { useHasActiveVibes } from '../lib/vibe-ring';
import { Verified } from './Verified';
import { CommunityAvatar } from './communities/CommunityAvatar';

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
  /** Na página da comunidade, sem o cartão "post da comunidade X". */
  hideCommunity?: boolean;
}

/** Post no layout do Figma (Home page/For You): autor, texto, cartão da música e ações. */
export function PostCard({ item, onToggleLike, onMore, onOpenComments, onOpenLink, onOpen, expanded = false, onFollow, hideCommunity = false }: PostCardProps) {
  const { t, i18n } = useTranslation();
  const genres = useGenres();
  // Anel roxo na foto só para quem tem vibe ativa (que eu posso ver).
  const hasVibes = useHasActiveVibes(item.author_id);
  // Curtir: o coração dá um pulo (só ao curtir; descurtir não comemora).
  const heart = usePop();
  const like = () => {
    if (!item.liked_by_me) heart.pop();
    onToggleLike(item);
  };
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
      {item.community && !hideCommunity ? (
        // Post de comunidade: de qual comunidade e quem postou (tocar abre a comunidade).
        <Reactive
          testID={`post-community-${item.id}`}
          accessibilityRole="link"
          accessibilityLabel={t('communities.postFrom', { name: item.community.name, username: item.author_username })}
          onPress={() => router.push(`/c/${item.community!.slug}`)}
          pressScale={0.97}
          style={({ hovered }) => [styles.community, hovered && styles.communityHover]}
        >
          <CommunityAvatar name={item.community.name} color={item.community.color} size={22} />
          <Text style={styles.communityText} numberOfLines={1}>
            <Text style={styles.communityName}>{item.community.name}</Text> · {t('communities.postedBy', { username: item.author_username })}
          </Text>
        </Reactive>
      ) : null}
      <View style={styles.header}>
        <Link href={`/u/${item.author_username}`} asChild>
          <Pressable style={styles.author} accessibilityRole="link">
            <RingAvatar uri={item.author_avatar_url} name={item.author_display_name} size={38} ring={hasVibes} />
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
          <Reactive
            testID={`follow-${item.author_username}`}
            accessibilityRole="button"
            accessibilityLabel={t('feed.followUser', { username: item.author_username })}
            onPress={() => onFollow(item)}
            hitSlop={8}
            pressScale={0.92}
            hoverScale={1.05}
            style={styles.follow}
          >
            <Text style={styles.followText}>{t('feed.follow')}</Text>
          </Reactive>
        ) : null}
        {onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('feed.postOptions')}
            hitSlop={12}
            onPress={() => onMore(item)}
            style={[styles.more, webTouch(12, { vertical: 2, horizontal: space.sm })]}
          >
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

      <PostMedia media={item.media ?? []} postId={item.id} />

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
            // Toque no gênero: os posts com esse gênero (Buscar › gênero).
            <Reactive
              key={g}
              testID={`post-genre-${g}`}
              accessibilityRole="link"
              onPress={() => router.push(`/genre/${g}`)}
              pressScale={0.92}
              hoverScale={1.06}
              style={({ hovered }) => [styles.genre, hovered && styles.genreHover]}
              hitSlop={4}
            >
              <Text style={styles.genreText}>{genreLabel(genres.data, g, i18n.language) ?? g}</Text>
            </Reactive>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Reactive
          accessibilityRole="button"
          accessibilityLabel={item.liked_by_me ? t('feed.unlike') : t('feed.like')}
          accessibilityState={{ selected: item.liked_by_me }}
          onPress={like}
          pressScale={0.88}
          hoverScale={1.08}
          style={[styles.action, webTouch(10)]}
          hitSlop={10}
        >
          <Animated.View style={heart.style}>
            <Icon name={item.liked_by_me ? 'heartFilled' : 'heart'} size={14} color={item.liked_by_me ? colors.primary : colors.text} />
          </Animated.View>
          <Text style={styles.count}>{item.like_count}</Text>
        </Reactive>
        <Reactive
          accessibilityRole="button"
          accessibilityLabel={t('feed.comments')}
          onPress={() => onOpenComments?.(item)}
          pressScale={0.88}
          hoverScale={1.08}
          style={[styles.action, webTouch(10)]}
          hitSlop={10}
        >
          <Icon name="comment" size={13} />
          <Text style={styles.count}>{item.comment_count}</Text>
        </Reactive>
        <Reactive
          accessibilityRole="button"
          accessibilityLabel={t('feed.share')}
          onPress={share}
          pressScale={0.88}
          hoverScale={1.08}
          style={[styles.action, webTouch(10)]}
          hitSlop={10}
        >
          <Icon name="share" size={13} />
        </Reactive>
        {/* No feed, há quanto tempo; com o post aberto, a data e a hora exatas. */}
        <Text testID="post-time" style={styles.time} numberOfLines={1}>
          {expanded ? exactTime(item.created_at) : relativeTime(item.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  community: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: space.md,
    borderRadius: 999,
    ...glass.chip,
  },
  communityHover: { backgroundColor: glass.pressed },
  communityText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  communityName: { fontFamily: fonts.bold, color: colors.text },
  follow: {
    marginLeft: 'auto',
    backgroundColor: colors.primary,
    backgroundImage: gradients.primary,
    boxShadow: '0 4px 12px rgba(104, 94, 255, 0.3)',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 28,
    justifyContent: 'center',
  },
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
  genre: { borderRadius: 999, ...glass.chip, paddingHorizontal: space.sm + 2, paddingVertical: 3 },
  genreHover: { backgroundColor: glass.pressed, borderColor: 'rgba(255, 255, 255, 0.22)' },
  genreText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.textMutedOnSurface },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontFamily: fonts.regular, fontSize: 11, color: colors.text },
  time: { marginLeft: 'auto', fontFamily: fonts.regular, fontSize: 10, color: colors.text },
});
