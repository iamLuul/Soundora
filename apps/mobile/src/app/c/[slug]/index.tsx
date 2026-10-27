import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityAvatar } from '../../../components/communities/CommunityAvatar';
import { ErrorScreen } from '../../../components/ErrorScreen';
import { ErrorState } from '../../../components/ErrorState';
import { BackHeader, RingAvatar, TopTabs } from '../../../components/figma';
import { OptionsSheet, type SheetOption } from '../../../components/OptionsSheet';
import { PostList } from '../../../components/PostList';
import { PeopleSkeleton, ProfileSkeleton } from '../../../components/Skeleton';
import { Spinner } from '../../../components/Spinner';
import { showToast } from '../../../components/Toast';
import { Button } from '../../../components/ui';
import { Verified } from '../../../components/Verified';
import {
  banFromCommunity,
  fetchCommunityMembers,
  joinCommunity,
  leaveCommunity,
  respondCommunityRequest,
  setCommunityRole,
  type Community,
  type CommunityMember,
  type CommunityMemberStatus,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { confirmAction, notify } from '../../../lib/dialogs';
import { errorStatus, formatError } from '../../../lib/errors';
import { uniqueBy } from '../../../lib/hooks';
import { genreLabel, keys, useCommunity, useCommunityPosts, useGenres } from '../../../lib/queries';
import { colors, fonts, space, text } from '../../../theme';

type Tab = 'posts' | 'members' | 'requests' | 'banned';

/**
 * Página da comunidade: nome, descrição, gêneros e artistas; entrar, pedir para entrar ou sair;
 * os posts (escondidos de quem é de fora, na fechada); os membros; e, para quem modera, os
 * pedidos e os banidos.
 */
export default function CommunityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const community = useCommunity(slug ?? '');
  const c = community.data;
  const [tab, setTab] = useState<Tab>('posts');
  const isMod = c?.my_status === 'active' && (c.my_role === 'owner' || c.my_role === 'moderator');

  if (community.isLoading) return <ProfileSkeleton />;
  if (community.isError) {
    const status = errorStatus(community.error);
    return status === 401 || status === 403 || status === 404 ? (
      <ErrorScreen code={status} />
    ) : (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ErrorState message={formatError(t, community.error)} onRetry={() => community.refetch()} />
      </View>
    );
  }
  if (!c) return <ErrorScreen code={404} />;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'posts', label: t('communities.posts') },
    { value: 'members', label: t('communities.membersTab') },
    ...(isMod
      ? [
          { value: 'requests' as const, label: c.pending_count ? t('communities.requestsCount', { count: c.pending_count }) : t('communities.requests') },
          { value: 'banned' as const, label: t('communities.banned') },
        ]
      : []),
  ];
  const header = (
    <View>
      <Hero community={c} />
      <TopTabs showBell={false} value={tab} onChange={setTab} tabs={tabs} style={{ marginBottom: space.sm }} />
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <BackHeader
          right={
            c.my_role === 'owner' && c.my_status === 'active' ? (
              <Pressable
                testID="community-settings"
                accessibilityRole="button"
                accessibilityLabel={t('communities.settings')}
                onPress={() => router.push(`/c/${c.slug}/settings`)}
                hitSlop={10}
              >
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </Pressable>
            ) : undefined
          }
        />
      </View>
      {tab === 'posts' ? (
        <CommunityPosts community={c} header={header} isMod={isMod} />
      ) : (
        <Members community={c} status={tabStatus(tab)} header={header} isMod={isMod} />
      )}
    </View>
  );
}

const tabStatus = (tab: Tab): CommunityMemberStatus => (tab === 'requests' ? 'pending' : tab === 'banned' ? 'banned' : 'active');

function Hero({ community: c }: { community: Community }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const genres = useGenres();
  const [busy, setBusy] = useState(false);
  const closed = c.visibility === 'closed';
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['communities'] }), qc.invalidateQueries({ queryKey: keys.suggested })]);

  const join = async () => {
    setBusy(true);
    try {
      const status = await joinCommunity(c.id);
      showToast(status === 'pending' ? t('communities.requestSent') : t('communities.joined', { name: c.name }));
      await refresh();
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    const pending = c.my_status === 'pending';
    if (!pending && !(await confirmAction(t('communities.leaveConfirm', { name: c.name }), t('communities.leave'), t('common.cancel')))) return;
    setBusy(true);
    try {
      await leaveCommunity(c.id);
      await refresh();
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setBusy(false);
    }
  };

  const member = c.my_status === 'active';
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <CommunityAvatar name={c.name} color={c.color} size={76} closed={closed} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} accessibilityRole="header">
            {c.name}
          </Text>
          <Text style={styles.slug}>@{c.slug}</Text>
          <Text style={styles.meta}>
            {t('communities.members', { count: c.member_count })} · {closed ? t('communities.closed') : t('communities.open')}
          </Text>
        </View>
      </View>
      {c.description ? <Text style={styles.description}>{c.description}</Text> : null}
      {c.artists.length ? (
        <View style={styles.artists}>
          <Ionicons name="mic-outline" size={14} color={colors.textMuted} />
          <Text style={styles.artistsText}>{c.artists.join(' · ')}</Text>
        </View>
      ) : null}
      {c.genres.length ? (
        <View style={styles.genres}>
          {c.genres.map((g) => (
            <Pressable key={g} accessibilityRole="link" onPress={() => router.push(`/genre/${g}`)} style={styles.genre}>
              <Text style={styles.genreText}>{genreLabel(genres.data, g, i18n.language) ?? g}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {c.my_status === 'banned' ? (
          <Text style={[text.small, { color: colors.danger }]}>{t('communities.youAreBanned')}</Text>
        ) : c.my_role === 'owner' ? (
          <Button
            testID="community-post"
            title={t('communities.postHere')}
            size="sm"
            onPress={() => router.push({ pathname: '/compose', params: { community: c.id } })}
            style={{ flex: 1 }}
          />
        ) : member ? (
          <>
            <Button
              testID="community-post"
              title={t('communities.postHere')}
              size="sm"
              onPress={() => router.push({ pathname: '/compose', params: { community: c.id } })}
              style={{ flex: 1 }}
            />
            <Button testID="community-leave" title={t('communities.leave')} size="sm" variant="ghost" onPress={leave} loading={busy} />
          </>
        ) : c.my_status === 'pending' ? (
          <Button
            testID="community-cancel-request"
            title={t('communities.requested')}
            size="sm"
            variant="ghost"
            onPress={leave}
            loading={busy}
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            testID="community-join"
            title={closed ? t('communities.askToJoin') : t('communities.join')}
            size="sm"
            onPress={join}
            loading={busy}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}

function CommunityPosts({ community: c, header, isMod }: { community: Community; header: React.ReactElement; isMod: boolean }) {
  const { t } = useTranslation();
  const posts = useCommunityPosts(c.id, c.can_view);
  const items = posts.data?.pages.flat() ?? [];
  const modOf = useMemo(() => (isMod ? new Set([c.id]) : undefined), [isMod, c.id]);
  if (!c.can_view) {
    return (
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            {header}
            <View style={styles.locked} testID="community-locked">
              <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
              <Text style={[text.body, { textAlign: 'center', color: colors.textMuted }]}>{t('communities.lockedBody')}</Text>
            </View>
          </View>
        }
      />
    );
  }
  return (
    <PostList
      header={header}
      items={items}
      loading={posts.isLoading}
      onRefresh={() => posts.refetch()}
      onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
      loadingMore={posts.isFetchingNextPage}
      emptyText={c.my_status === 'active' ? t('communities.emptyMember') : t('communities.empty')}
      errorText={posts.isError ? formatError(t, posts.error) : null}
      modOf={modOf}
      hideCommunity
    />
  );
}

function Members({ community: c, status, header, isMod }: { community: Community; status: CommunityMemberStatus; header: React.ReactElement; isMod: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const enabled = status === 'active' ? c.can_view : isMod;
  const members = useInfiniteQuery({
    queryKey: ['communities', 'members', c.id, status],
    enabled,
    queryFn: ({ pageParam }) => fetchCommunityMembers(c.id, status, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < 50 ? undefined : all.flat().length),
  });
  const list = uniqueBy(members.data?.pages.flat() ?? [], (m) => m.user_id, 'membros');
  const [menuFor, setMenuFor] = useState<CommunityMember | null>(null);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setMenuFor(null);
    try {
      await fn();
      if (done) showToast(done);
      await qc.invalidateQueries({ queryKey: ['communities'] });
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  const owner = c.my_role === 'owner';
  const options: SheetOption[] = !menuFor
    ? []
    : [
        {
          key: 'profile',
          label: t('communities.viewProfile'),
          icon: 'person-outline',
          onPress: () => (setMenuFor(null), router.push(`/u/${menuFor.username}`)),
        },
        ...(owner && menuFor.role === 'member'
          ? [
              {
                key: 'promote',
                label: t('communities.makeModerator'),
                icon: 'shield-outline' as const,
                onPress: () => run(() => setCommunityRole(c.id, menuFor.user_id, 'moderator')),
              },
            ]
          : []),
        ...(owner && menuFor.role === 'moderator'
          ? [
              {
                key: 'demote',
                label: t('communities.removeModerator'),
                icon: 'shield-half-outline' as const,
                onPress: () => run(() => setCommunityRole(c.id, menuFor.user_id, 'member')),
              },
            ]
          : []),
        ...(owner && menuFor.role !== 'owner'
          ? [
              {
                key: 'transfer',
                label: t('communities.transfer'),
                icon: 'swap-horizontal-outline' as const,
                onPress: async () => {
                  const m = menuFor;
                  setMenuFor(null);
                  if (!(await confirmAction(t('communities.transferConfirm', { username: m.username }), t('communities.transfer'), t('common.cancel')))) return;
                  await run(() => setCommunityRole(c.id, m.user_id, 'owner'));
                },
              },
            ]
          : []),
        ...(menuFor.role === 'member' || (owner && menuFor.role === 'moderator')
          ? [
              {
                key: 'ban',
                label: t('communities.ban'),
                icon: 'remove-circle-outline' as const,
                danger: true,
                onPress: async () => {
                  const m = menuFor;
                  setMenuFor(null);
                  if (!(await confirmAction(t('communities.banConfirm', { username: m.username }), t('communities.ban'), t('common.cancel')))) return;
                  await run(() => banFromCommunity(c.id, m.user_id, true), t('communities.bannedToast', { username: m.username }));
                },
              },
            ]
          : []),
      ];

  return (
    <>
      <FlatList
        data={enabled ? list : []}
        keyExtractor={(m) => m.user_id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        onEndReached={() => members.hasNextPage && !members.isFetchingNextPage && members.fetchNextPage()}
        ListFooterComponent={members.isFetchingNextPage ? <Spinner style={{ margin: space.lg }} /> : undefined}
        ListEmptyComponent={
          !enabled ? (
            <View style={styles.locked}>
              <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
              <Text style={[text.body, { textAlign: 'center', color: colors.textMuted }]}>{t('communities.lockedBody')}</Text>
            </View>
          ) : members.isLoading ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <PeopleSkeleton count={6} avatar={44} />
            </View>
          ) : members.isError ? (
            <ErrorState message={formatError(t, members.error)} onRetry={() => members.refetch()} />
          ) : (
            <Text style={[text.body, styles.empty]}>
              {t(status === 'pending' ? 'communities.noRequests' : status === 'banned' ? 'communities.noBanned' : 'communities.noMembers')}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.memberRow} testID={`member-${item.username}`}>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${item.username}`)} style={styles.memberLeft}>
              <RingAvatar uri={item.avatar_url} name={item.display_name} size={44} ring={false} />
              <View style={{ flexShrink: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  <Verified username={item.username} size={12} />
                </View>
                <Text style={styles.memberHandle}>@{item.username}</Text>
              </View>
              {item.role !== 'member' ? (
                <View style={[styles.role, item.role === 'owner' && styles.roleOwner]}>
                  <Text style={styles.roleText}>{t(item.role === 'owner' ? 'communities.owner' : 'communities.moderator')}</Text>
                </View>
              ) : null}
            </Pressable>
            {status === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  testID={`accept-${item.username}`}
                  title={t('communities.accept')}
                  size="sm"
                  onPress={() => run(() => respondCommunityRequest(c.id, item.user_id, true))}
                />
                <Button
                  testID={`decline-${item.username}`}
                  title={t('communities.decline')}
                  size="sm"
                  variant="ghost"
                  onPress={() => run(() => respondCommunityRequest(c.id, item.user_id, false))}
                />
              </View>
            ) : status === 'banned' ? (
              <Button
                testID={`unban-${item.username}`}
                title={t('communities.unban')}
                size="sm"
                variant="ghost"
                onPress={() => run(() => banFromCommunity(c.id, item.user_id, false))}
              />
            ) : isMod && item.user_id !== profile?.id && item.role !== 'owner' ? (
              <Pressable
                testID={`member-menu-${item.username}`}
                accessibilityRole="button"
                accessibilityLabel={t('communities.memberOptions', { username: item.username })}
                onPress={() => setMenuFor(item)}
                hitSlop={10}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
        )}
      />
      <OptionsSheet visible={!!menuFor} title={menuFor ? `@${menuFor.username}` : undefined} options={options} onClose={() => setMenuFor(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: space.lg, marginBottom: space.sm },
  hero: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  name: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  slug: { fontFamily: fonts.regular, fontSize: 13, color: colors.handle },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  description: { ...text.body },
  artists: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  artistsText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  genre: { borderRadius: 10, borderWidth: 1, borderColor: colors.handle, paddingHorizontal: space.sm, paddingVertical: 2 },
  genreText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  locked: { alignItems: 'center', gap: space.md, padding: space.xxl },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.lg },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  memberLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  memberName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text, flexShrink: 1 },
  memberHandle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  role: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.surface },
  roleOwner: { backgroundColor: colors.primary },
  roleText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.text },
});
