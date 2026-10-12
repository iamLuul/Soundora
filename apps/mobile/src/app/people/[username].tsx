import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader, RingAvatar, TopTabs } from '../../components/figma';
import { setFollowing, type PersonRow } from '../../lib/api';
import { formatError } from '../../lib/errors';
import { keys, usePeople } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';
import { uniqueBy } from '../../lib/hooks';
import { PeopleSkeleton } from '../../components/Skeleton';
import { listPerf } from '../../lib/list';
import { Verified } from '../../components/Verified';

type List = 'followers' | 'following';

/** Seguidores e Seguindo de um perfil, em abas, com o botão de seguir em cada pessoa. */
export default function PeopleScreen() {
  const { username, list: initial } = useLocalSearchParams<{ username: string; list?: List }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<List>(initial === 'following' ? 'following' : 'followers');
  const people = usePeople(username, list);
  const items = uniqueBy(people.data?.pages.flat() ?? [], (p) => p.id, 'pessoas');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <BackHeader />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          @{username}
        </Text>
      </View>
      <TopTabs
        showBell={false}
        value={list}
        onChange={setList}
        tabs={[
          { value: 'followers', label: t('profile.followers') },
          { value: 'following', label: t('profile.following') },
        ]}
      />
      <FlatList
        {...listPerf}
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PersonItem person={item} username={username} list={list} />}
        ListEmptyComponent={
          people.isLoading ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <PeopleSkeleton count={8} action />
            </View>
          ) : (
            <Text style={styles.empty}>{people.isError ? formatError(t, people.error) : t(list === 'followers' ? 'people.noFollowers' : 'people.noFollowing')}</Text>
          )
        }
        onEndReached={() => people.hasNextPage && !people.isFetchingNextPage && people.fetchNextPage()}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      />
    </View>
  );
}

function PersonItem({ person, username, list }: { person: PersonRow; username: string; list: List }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [following, setFollowingState] = useState(person.i_follow);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await setFollowing(person.id, !following);
      setFollowingState(!following);
      void qc.invalidateQueries({ queryKey: ['following'] });
      void qc.invalidateQueries({ queryKey: keys.people(username, list) });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    } catch {
      // mantém o estado anterior
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable testID={`person-${person.username}`} accessibilityRole="link" onPress={() => router.push(`/u/${person.username}`)} style={styles.row}>
      <RingAvatar uri={person.avatar_url} name={person.display_name} size={44} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
            {person.display_name}
          </Text>
          <Verified username={person.username} />
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{person.username}
        </Text>
        {person.bio ? (
          <Text style={styles.bio} numberOfLines={1}>
            {person.bio}
          </Text>
        ) : null}
      </View>
      {!person.is_me ? (
        <Pressable
          testID={`follow-${person.username}`}
          accessibilityRole="button"
          onPress={toggle}
          disabled={busy}
          style={[styles.follow, following && styles.followingBtn, busy && { opacity: 0.6 }]}
        >
          <Text style={[styles.followText, following && { color: colors.text }]}>{following ? t('profile.followingButton') : t('profile.follow')}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.lg },
  header: { justifyContent: 'center' },
  title: { position: 'absolute', alignSelf: 'center', fontFamily: fonts.bold, fontSize: 16, color: colors.text, maxWidth: '70%' },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.tabBar },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  bio: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  follow: { borderRadius: 10, backgroundColor: colors.primary, paddingHorizontal: space.lg, paddingVertical: 6 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.handle },
  followText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
});
