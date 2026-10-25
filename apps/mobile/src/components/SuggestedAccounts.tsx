import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
// ScrollView do gesture-handler: rolar o carrossel não troca de aba.
import { ScrollView } from 'react-native-gesture-handler';
import type { SuggestedAccount } from '../lib/api';
import { genreLabel, useFollow, useFollowingIds, useGenres, useRequestedIds, useSuggestedAccounts } from '../lib/queries';
import { colors, fonts, space } from '../theme';
import { RingAvatar } from './figma';
import { Verified } from './Verified';

/**
 * "Contas para seguir": carrossel de pessoas com o seu gosto (gêneros dos posts que você
 * curte, comenta, posta e do Descobrir), de quem você curte posts ou seguidas por quem você
 * segue. Aparece no meio do Para você e quando a aba Seguindo está vazia.
 */
export function SuggestedAccounts({
  testID = 'suggested-accounts',
  panel = false,
}: {
  testID?: string;
  /** Na coluna da direita do desktop. */ panel?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const suggested = useSuggestedAccounts();
  const followingIds = useFollowingIds();
  const follow = useFollow();
  const requestedIds = useRequestedIds();
  const genres = useGenres();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scroll = useScrollArrows(scrollRef);
  const list = suggested.data ?? [];
  if (!list.length) return null;

  const reason = (a: SuggestedAccount) => {
    if (a.reason === 'genres' && a.genres.length) {
      const names = a.genres.map((g) => genreLabel(genres.data, g, i18n.language) ?? g);
      return t('suggest.genres', { genres: names.join(', ') });
    }
    return t(a.reason === 'liked' ? 'suggest.liked' : 'suggest.friends');
  };

  return (
    <View style={panel ? styles.wrapPanel : styles.wrap} testID={testID}>
      <Text style={[styles.title, panel && { paddingHorizontal: 0 }]} accessibilityRole="header">
        {t('suggest.title')}
      </Text>
      <View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.row, panel && { paddingHorizontal: 0 }]}
          onScroll={scroll.onScroll}
          scrollEventThrottle={32}
          onLayout={(e) => scroll.setViewport(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => scroll.setContent(w)}
        >
          {list.map((a) => {
            const following = followingIds.data?.has(a.id) ?? false;
            const requested = !following && (requestedIds.data?.has(a.id) ?? false);
            return (
              <View key={a.id} style={[styles.card, panel && styles.cardPanel]}>
                <Pressable accessibilityRole="link" accessibilityLabel={`@${a.username}`} onPress={() => router.push(`/u/${a.username}`)} style={styles.who}>
                  <RingAvatar uri={a.avatar_url} name={a.display_name} size={56} />
                  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4 }, { maxWidth: '100%' }]}>
                    <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                      {a.display_name}
                    </Text>
                    <Verified username={a.username} />
                  </View>
                  <Text style={styles.handle} numberOfLines={1}>
                    @{a.username}
                  </Text>
                  <Text style={styles.reason} numberOfLines={2}>
                    {reason(a)}
                  </Text>
                </Pressable>
                <Pressable
                  testID={`suggest-follow-${a.username}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: following || requested }}
                  accessibilityLabel={following ? t('profile.unfollow') : t('feed.followUser', { username: a.username })}
                  onPress={() => follow.mutate({ userId: a.id, follow: !(following || requested) })}
                  style={({ pressed }) => [styles.button, (following || requested) && styles.buttonFollowing, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.buttonText}>{following ? t('profile.followingButton') : requested ? t('profile.requested') : t('feed.follow')}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        {/* Degradê nas bordas: mostra que tem mais contas para os lados. */}
        {scroll.canLeft ? <EdgeFade side="left" /> : null}
        {scroll.canRight ? <EdgeFade side="right" /> : null}
        {/* Web: setas para deslizar (com mouse não dá para arrastar o carrossel). */}
        {WEB && scroll.canLeft ? <ArrowButton side="left" label={t('suggest.previous')} onPress={() => scroll.page(-1)} /> : null}
        {WEB && scroll.canRight ? <ArrowButton side="right" label={t('suggest.next')} onPress={() => scroll.page(1)} /> : null}
      </View>
    </View>
  );
}

const WEB = Platform.OS === 'web';
const FADE = 48;

/** Posição do carrossel: dá para ir para a esquerda/direita? E rolar uma "página" com as setas. */
function useScrollArrows(ref: RefObject<ScrollViewInstance | null>) {
  const [x, setX] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const max = Math.max(0, content - viewport);
  return {
    setViewport,
    setContent,
    canLeft: x > 4,
    canRight: viewport > 0 && x < max - 4,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => setX(e.nativeEvent.contentOffset.x),
    page: (dir: 1 | -1) => {
      const to = Math.min(max, Math.max(0, x + dir * viewport * 0.8));
      ref.current?.scrollTo({ x: to, animated: true });
      setX(to);
    },
  };
}

/** Degradê do fundo da tela por cima da borda do carrossel (não pega toques). */
function EdgeFade({ side }: { side: 'left' | 'right' }) {
  const id = `fade-${side}`;
  return (
    <View pointerEvents="none" style={[styles.fade, side === 'left' ? { left: 0 } : { right: 0 }]}>
      <Svg width={FADE} height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={side === 'left' ? 1 : 0} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={side === 'left' ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={FADE} height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function ArrowButton({ side, label, onPress }: { side: 'left' | 'right'; label: string; onPress: () => void }) {
  return (
    <Pressable
      testID={`suggest-${side === 'left' ? 'prev' : 'next'}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.arrow,
        side === 'left' ? { left: 4 } : { right: 4 },
        (pressed || hovered) && { backgroundColor: colors.primary },
      ]}
    >
      <Ionicons name={side === 'left' ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, paddingVertical: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, paddingHorizontal: space.lg },
  row: { gap: space.md, paddingHorizontal: space.lg },
  wrapPanel: { gap: space.md },
  cardPanel: { width: 132, borderWidth: 1, borderColor: colors.muted, backgroundColor: 'transparent' },
  card: { width: 148, backgroundColor: colors.card, borderRadius: 14, padding: space.md, gap: space.sm, alignItems: 'center' },
  who: { alignItems: 'center', gap: 2, alignSelf: 'stretch' },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, marginTop: space.xs },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  reason: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center', minHeight: 28, marginTop: 2 },
  button: { alignSelf: 'stretch', height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonFollowing: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.surface },
  buttonText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
