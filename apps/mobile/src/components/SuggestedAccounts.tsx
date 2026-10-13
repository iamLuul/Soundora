import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
export function SuggestedAccounts({ testID = 'suggested-accounts' }: { testID?: string }) {
  const { t, i18n } = useTranslation();
  const suggested = useSuggestedAccounts();
  const followingIds = useFollowingIds();
  const follow = useFollow();
  const requestedIds = useRequestedIds();
  const genres = useGenres();
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
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title} accessibilityRole="header">
        {t('suggest.title')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {list.map((a) => {
          const following = followingIds.data?.has(a.id) ?? false;
          const requested = !following && (requestedIds.data?.has(a.id) ?? false);
          return (
            <View key={a.id} style={styles.card}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, paddingVertical: space.lg, gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, paddingHorizontal: space.lg },
  row: { gap: space.md, paddingHorizontal: space.lg },
  card: { width: 148, backgroundColor: colors.card, borderRadius: 14, padding: space.md, gap: space.sm, alignItems: 'center' },
  who: { alignItems: 'center', gap: 2, alignSelf: 'stretch' },
  name: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, marginTop: space.xs },
  handle: { fontFamily: fonts.regular, fontSize: 11, color: colors.handle },
  reason: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center', minHeight: 28, marginTop: 2 },
  button: { alignSelf: 'stretch', height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonFollowing: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.surface },
  buttonText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
});
