import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// ScrollView do gesture-handler: rolar a fila de vibes não troca de aba.
import { ScrollView } from 'react-native-gesture-handler';
import { fetchFollowing, type VibeTrayItem } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useVibesTray } from '../lib/queries';
import { colors, fonts, space } from '../theme';
import { Icon } from './figma';
import { Avatar } from './ui';
import { uniqueBy } from '../lib/hooks';
import { VibesRowSkeleton } from './Skeleton';
import { webTouch } from '../lib/touch';

const SIZE = 62;

/** Avatar com o anel das Vibes: roxo = tem vibe que eu não vi; cinza = já vi tudo; sem anel = sem vibe. */
function VibeRing({ uri, name, state }: { uri: string | null; name: string; state: 'unseen' | 'seen' | 'none' }) {
  const ring = state === 'unseen' ? colors.primary : state === 'seen' ? colors.handle : 'transparent';
  return (
    <View style={[styles.ring, { borderColor: ring }]}>
      <Avatar uri={uri} name={name} size={SIZE - 8} />
    </View>
  );
}

/**
 * Fila do topo da Home (Figma: Home page, "Stories" → Vibes). Primeiro você, com o "+" para
 * criar uma vibe; depois quem você segue com vibe ativa (não vistas primeiro) e, por fim,
 * quem você segue sem vibe (abre o perfil).
 */
export function FollowingRow() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const following = useQuery({ queryKey: ['following'], queryFn: fetchFollowing });
  const tray = useVibesTray(!!profile);
  if (!profile) return null;
  if (tray.isLoading && following.isLoading) return <VibesRowSkeleton />;

  const items = tray.data ?? [];
  const mine = items.find((x) => x.is_me);
  const others = uniqueBy(items.filter((x) => !x.is_me), (x) => x.author_id, 'fila de vibes');
  const withVibes = new Set(others.map((x) => x.username));
  const rest = uniqueBy((following.data ?? []).filter((p) => !withVibes.has(p.username)), (p) => p.username, 'seguindo');

  /** Abre as vibes de alguém e deixa na fila as pessoas seguintes. */
  const open = (item: VibeTrayItem, list: VibeTrayItem[]) => {
    const after = list.slice(list.indexOf(item) + 1).map((x) => x.author_id);
    router.push({ pathname: '/vibes/[author]', params: { author: item.author_id, queue: after.join(',') } });
  };

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel={t('feed.stories')}>
        <View style={styles.item}>
          <Pressable
            testID="vibe-me"
            accessibilityRole="button"
            accessibilityLabel={mine ? t('vibes.seeMine') : t('vibes.new')}
            onPress={() => (mine ? open(mine, [mine, ...others]) : router.push('/vibes/new'))}
          >
            <VibeRing uri={profile.avatar_url} name={profile.display_name} state={mine ? 'seen' : 'none'} />
          </Pressable>
          <Pressable testID="vibe-new" accessibilityRole="button" accessibilityLabel={t('vibes.new')} onPress={() => router.push('/vibes/new')} style={[styles.plus, webTouch(8)]} hitSlop={8}>
            <Icon name="plus" size={8} />
          </Pressable>
          <Text style={styles.name} numberOfLines={1}>
            {t('vibes.you')}
          </Text>
        </View>

        {others.map((x) => (
          <Pressable key={x.author_id} testID={`vibe-${x.username}`} accessibilityRole="button" accessibilityLabel={t('vibes.of', { username: x.username })} onPress={() => open(x, others)} style={styles.item}>
            <VibeRing uri={x.avatar_url} name={x.display_name} state={x.unseen ? 'unseen' : 'seen'} />
            <Text style={styles.name} numberOfLines={1}>
              {x.username}
            </Text>
          </Pressable>
        ))}

        {rest.map((p) => (
          <Pressable key={p.username} accessibilityRole="link" accessibilityLabel={`@${p.username}`} onPress={() => router.push(`/u/${p.username}`)} style={styles.item}>
            <VibeRing uri={p.avatar_url} name={p.display_name} state="none" />
            <Text style={styles.name} numberOfLines={1}>
              {p.username}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar, paddingBottom: space.md },
  row: { gap: 14, paddingHorizontal: space.md },
  item: { alignItems: 'center', width: SIZE + 4, gap: 4 },
  ring: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.regular, fontSize: 11, color: colors.text, maxWidth: SIZE + 4 },
  plus: {
    position: 'absolute',
    right: 2,
    top: SIZE - 18,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
