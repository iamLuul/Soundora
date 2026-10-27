import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// ScrollView do gesture-handler: rolar a fila de vibes não troca de aba.
import { FlatList } from 'react-native-gesture-handler';
import type { VibeTrayItem } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useVibesTray } from '../lib/queries';
import { colors, fonts, space } from '../theme';
import { Icon } from './figma';
import { Avatar } from './ui';
import { uniqueBy } from '../lib/hooks';
import { VibesRowSkeleton } from './Skeleton';
import { canCreateVibes } from '../lib/vibes-create';
import { webTouch } from '../lib/touch';
import { Reactive } from './Reactive';

const SIZE = 62;
const ITEM_W = SIZE + 4;
const GAP = 14;
/** Quantas pessoas seguem na fila ao abrir uma vibe (a lista inteira ia na URL; 100 ids passam de 3 KB). */
const QUEUE_MAX = 30;

/** Avatar com o anel das Vibes: roxo = tem vibe que eu não vi; cinza = já vi tudo; sem anel = sem vibe. */
function VibeRing({ uri, name, state }: { uri: string | null; name: string; state: 'unseen' | 'seen' | 'none' }) {
  // Vibe não vista: anel em degradê (roxo para rosa), que chama mais atenção que o anel liso.
  if (state === 'unseen') {
    return (
      <View style={[styles.ring, styles.ringUnseen]}>
        <View style={styles.ringGap}>
          <Avatar uri={uri} name={name} size={SIZE - 8} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.ring, { borderColor: state === 'seen' ? colors.handle : 'transparent' }]}>
      <Avatar uri={uri} name={name} size={SIZE - 8} />
    </View>
  );
}

/**
 * Fila do topo da Home (Figma: Home page, "Stories" → Vibes). Primeiro você, com o "+" para
 * criar uma vibe; depois só quem você segue e tem vibe ativa (não vistas primeiro). Quem não
 * postou nada não aparece aqui.
 */
export function FollowingRow() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const tray = useVibesTray(!!profile);
  if (!profile) return null;
  if (tray.isLoading) return <VibesRowSkeleton />;

  const items = tray.data ?? [];
  const mine = items.find((x) => x.is_me);
  const others = uniqueBy(
    items.filter((x) => !x.is_me),
    (x) => x.author_id,
    'fila de vibes',
  );

  /** Abre as vibes de alguém e deixa na fila as pessoas seguintes. */
  const open = (item: VibeTrayItem, list: VibeTrayItem[]) => {
    const after = list.slice(list.indexOf(item) + 1, list.indexOf(item) + 1 + QUEUE_MAX).map((x) => x.author_id);
    router.push({ pathname: '/vibes/[author]', params: { author: item.author_id, queue: after.join(',') } });
  };

  // Eu primeiro (se puder criar ou já tiver vibe); depois a fila. Lista virtualizada: só monta
  // as pessoas perto da tela (a fila chega com até 100 e cada uma carrega um avatar).
  const showMe = canCreateVibes || !!mine;
  const entries: (VibeTrayItem | 'me')[] = [...(showMe ? (['me'] as const) : []), ...others];

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={entries}
        keyExtractor={(x) => (x === 'me' ? 'me' : x.author_id)}
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('feed.stories')}
        contentContainerStyle={styles.row}
        ItemSeparatorComponent={Separator}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        getItemLayout={(_, index) => ({ length: ITEM_W, offset: (ITEM_W + GAP) * index, index })}
        renderItem={({ item: x }) =>
          x === 'me' ? (
            <View style={styles.item}>
              <Reactive
                testID="vibe-me"
                accessibilityRole="button"
                accessibilityLabel={mine ? t('vibes.seeMine') : t('vibes.new')}
                onPress={() => (mine ? open(mine, [mine, ...others]) : router.push('/vibes/new'))}
                pressScale={0.92}
                hoverScale={1.05}
              >
                <VibeRing uri={profile.avatar_url} name={profile.display_name} state={mine ? 'seen' : 'none'} />
              </Reactive>
              {canCreateVibes ? (
                <Pressable
                  testID="vibe-new"
                  accessibilityRole="button"
                  accessibilityLabel={t('vibes.new')}
                  onPress={() => router.push('/vibes/new')}
                  style={[styles.plus, webTouch(8)]}
                  hitSlop={8}
                >
                  <Icon name="plus" size={8} />
                </Pressable>
              ) : null}
              <Text style={styles.name} numberOfLines={1}>
                {t('vibes.you')}
              </Text>
            </View>
          ) : (
            <Reactive
              testID={`vibe-${x.username}`}
              accessibilityRole="button"
              accessibilityLabel={t('vibes.of', { username: x.username })}
              onPress={() => open(x, others)}
              pressScale={0.92}
              hoverScale={1.05}
              style={styles.item}
            >
              <VibeRing uri={x.avatar_url} name={x.display_name} state={x.unseen ? 'unseen' : 'seen'} />
              <Text style={styles.name} numberOfLines={1}>
                {x.username}
              </Text>
            </Reactive>
          )
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={{ width: GAP }} />;
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -space.lg, borderBottomWidth: 1, borderBottomColor: colors.tabBar, paddingBottom: space.md },
  row: { paddingHorizontal: space.md },
  item: { alignItems: 'center', width: ITEM_W, gap: 4 },
  ring: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  ringUnseen: {
    borderWidth: 0,
    backgroundColor: colors.primary,
    backgroundImage: 'linear-gradient(135deg, #8A80FF 0%, #685EFF 45%, #FD5163 100%)',
    boxShadow: '0 0 12px rgba(104, 94, 255, 0.45)',
  },
  ringGap: {
    width: SIZE - 5,
    height: SIZE - 5,
    borderRadius: (SIZE - 5) / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
