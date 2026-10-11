import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { fetchFollowing } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, space } from '../theme';
import { Icon, RingAvatar } from './figma';

const SIZE = 62;

/**
 * Fila de avatares do topo do feed (Figma: Home page). O primeiro é você, com o "+" para
 * postar; depois, quem você segue.
 */
export function FollowingRow() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const following = useQuery({ queryKey: ['following'], queryFn: fetchFollowing });
  if (!profile) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel={t('feed.stories')}>
        <Pressable testID="story-me" accessibilityRole="button" accessibilityLabel={t('feed.newPost')} onPress={() => router.push('/compose')}>
          <RingAvatar uri={profile.avatar_url} name={profile.display_name} size={SIZE} />
          <View style={styles.plus} pointerEvents="none">
            <Icon name="plus" size={7} />
          </View>
        </Pressable>
        {(following.data ?? []).map((p) => (
          <Pressable key={p.username} accessibilityRole="link" accessibilityLabel={`@${p.username}`} onPress={() => router.push(`/u/${p.username}`)}>
            <RingAvatar uri={p.avatar_url} name={p.display_name} size={SIZE} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar, paddingBottom: space.lg },
  row: { gap: 14, paddingHorizontal: space.md },
  plus: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
