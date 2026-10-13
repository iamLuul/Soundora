import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
// ScrollView do gesture-handler: rolar os filtros não troca de aba.
import { ScrollView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RingAvatar, SearchField, TopTabs } from '../components/figma';
import { OptionsSheet, type SheetOption } from '../components/OptionsSheet';
import { PeopleSkeleton } from '../components/Skeleton';
import { Spinner } from '../components/Spinner';
import { Button, SegmentedControl, TextField } from '../components/ui';
import { Verified } from '../components/Verified';
import {
  isSuspended,
  useAdminActions,
  useAdminOverview,
  useAdminReports,
  useAdminUsers,
  useFeaturedAdmin,
  useIsAdmin,
  type AdminReport,
  type AdminUser,
  type ReportStatus,
  type UserFilter,
  type UserSort,
} from '../lib/admin';
import { formatError } from '../lib/errors';
import { useDebouncedValue } from '../lib/hooks';
import { exactTime } from '../lib/i18n';
import { listPerf } from '../lib/list';
import { colors, fonts, radius, space, text } from '../theme';
import { confirmAction, notify } from '../lib/dialogs';
import { ErrorState } from '../components/ErrorState';

type Tab = 'reports' | 'users' | 'featured';


/** O destaque já saiu do ar? */
function hasEnded(endsAt: string | null): boolean {
  return !!endsAt && Date.parse(endsAt) < Date.now();
}


/**
 * Painel admin: denúncias, usuários (verificar e suspender) e destaques do Descobrir, sem SQL.
 * Só abre para administradores; e quem decide é o banco (cada função confere is_admin).
 */
export default function AdminScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const admin = useIsAdmin();
  const [tab, setTab] = useState<Tab>('reports');

  if (admin.isLoading) return <Spinner style={{ flex: 1, backgroundColor: colors.background }} />;
  if (!admin.data) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Stack.Screen options={{ title: t('admin.title') }} />
        <Text style={[text.body, { color: colors.textMuted, textAlign: 'center' }]}>{t('admin.noAccess')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: t('admin.title') }} />
      <View style={styles.wrap}>
        <TopTabs
          showBell={false}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'reports', label: t('admin.tabReports') },
            { value: 'users', label: t('admin.tabUsers') },
            { value: 'featured', label: t('admin.tabFeatured') },
          ]}
        />
        <Overview />
        {tab === 'reports' ? <ReportsTab /> : tab === 'users' ? <UsersTab /> : <FeaturedTab />}
      </View>
    </View>
  );
}

function Overview() {
  const { t } = useTranslation();
  const o = useAdminOverview();
  if (!o.data) return null;
  return (
    <Text testID="admin-overview" style={[text.small, styles.overview]}>
      {t('admin.overview', { reports: o.data.open_reports, suspended: o.data.suspended, verified: o.data.verified, featured: o.data.featured_active })}
    </Text>
  );
}

// ---------------------------------------------------------------- denúncias

function ReportsTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReportStatus>('open');
  const reports = useAdminReports(status);
  return (
    <View style={{ flex: 1, gap: space.md }}>
      <SegmentedControl<ReportStatus>
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: t('admin.statusOpen') },
          { value: 'resolved', label: t('admin.statusResolved') },
          { value: 'dismissed', label: t('admin.statusDismissed') },
        ]}
      />
      <FlatList
        {...listPerf}
        data={reports.data ?? []}
        keyExtractor={(r) => `${r.target_type}-${r.target_id}`}
        renderItem={({ item }) => <ReportCard report={item} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          reports.isLoading ? (
            <PeopleSkeleton count={4} />
          ) : (
            reports.isError ? <ErrorState message={formatError(t, reports.error)} onRetry={() => reports.refetch()} /> : <Text style={[text.body, styles.empty]}>{t('admin.noReports')}</Text>
          )
        }
      />
    </View>
  );
}

function ReportCard({ report: r }: { report: AdminReport }) {
  const { t } = useTranslation();
  const { resolve, suspend } = useAdminActions();
  const [menu, setMenu] = useState(false);
  const open = r.status === 'open';
  const suspended = isSuspended(r.author_suspended_until);

  const act = async (action: 'dismiss' | 'remove') => {
    const ok = await confirmAction(t(action === 'remove' ? 'admin.confirmRemove' : 'admin.confirmDismiss'), t(`admin.${action}`), t('common.cancel'));
    if (!ok) return;
    resolve.mutate({ type: r.target_type, id: r.target_id, action }, { onError: (err) => notify(formatError(t, err)) });
  };
  const view = () => {
    if (r.post_id) router.push(`/post/${r.post_id}`);
    else if (r.author_username) router.push(`/u/${r.author_username}`);
  };

  return (
    <View style={styles.card} testID={`report-${r.target_id}`}>
      <View style={styles.row}>
        <Text style={styles.tag}>{t(`admin.type_${r.target_type}`)}</Text>
        <Text style={styles.count}>{t('admin.reportCount', { count: r.report_count })}</Text>
        <Text style={[text.small, { marginLeft: 'auto' }]}>{exactTime(r.latest_at)}</Text>
      </View>
      <Text style={styles.reasons}>{r.reasons.map((x) => t(`report.${x}`)).join(' · ')}</Text>
      <Text style={styles.preview} numberOfLines={4}>
        {r.exists_now ? (r.preview ?? '') : t('admin.gone')}
      </Text>
      {r.details.map((d, i) => (
        <Text key={i} style={styles.detail} numberOfLines={3}>
          “{d}”
        </Text>
      ))}
      {r.author_username ? (
        <View style={styles.row}>
          <RingAvatar uri={r.author_avatar_url} name={r.author_username} size={24} />
          <Text style={styles.handle}>@{r.author_username}</Text>
          {suspended ? <Text style={[styles.tag, styles.tagDanger]}>{t('admin.suspend')}</Text> : null}
        </View>
      ) : null}
      <View style={styles.actions}>
        {r.exists_now && (r.post_id || r.author_username) ? <Button size="sm" variant="ghost" title={t('admin.view')} onPress={view} /> : null}
        {open && r.exists_now && r.target_type !== 'profile' ? (
          <Button testID={`report-remove-${r.target_id}`} size="sm" variant="danger" title={t('admin.remove')} onPress={() => act('remove')} loading={resolve.isPending} />
        ) : null}
        {open ? <Button testID={`report-dismiss-${r.target_id}`} size="sm" variant="ghost" title={t('admin.dismiss')} onPress={() => act('dismiss')} /> : null}
        {r.author_id && !suspended ? <Button size="sm" variant="ghost" title={t('admin.suspendAuthor')} onPress={() => setMenu(true)} /> : null}
      </View>
      {r.author_id ? (
        <SuspendSheet
          visible={menu}
          username={r.author_username ?? ''}
          onClose={() => setMenu(false)}
          onPick={(days) => suspend.mutate({ userId: r.author_id!, days }, { onError: (err) => notify(formatError(t, err)) })}
        />
      ) : null}
    </View>
  );
}

function SuspendSheet({ visible, username, onClose, onPick }: { visible: boolean; username: string; onClose: () => void; onPick: (days: number | null) => void }) {
  const { t } = useTranslation();
  const pick = (days: number | null) => () => {
    onClose();
    onPick(days);
  };
  const options: SheetOption[] = [
    { key: 'suspend-7', label: t('admin.suspend7'), icon: 'time-outline', onPress: pick(7) },
    { key: 'suspend-30', label: t('admin.suspend30'), icon: 'calendar-outline', onPress: pick(30) },
    { key: 'suspend-forever', label: t('admin.suspendForever'), icon: 'ban-outline', danger: true, onPress: pick(null) },
  ];
  return <OptionsSheet visible={visible} title={t('admin.suspendTitle', { username })} options={options} onClose={onClose} />;
}

// ---------------------------------------------------------------- usuários

const USER_FILTERS: UserFilter[] = ['all', 'verified', 'regular', 'admin', 'suspended', 'reported'];
const USER_SORTS: UserSort[] = ['relevance', 'followers_desc', 'followers_asc', 'name_asc', 'name_desc'];

function UsersTab() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [sort, setSort] = useState<UserSort>('relevance');
  const [sortMenu, setSortMenu] = useState(false);
  const q = useDebouncedValue(query.trim(), 300);
  const users = useAdminUsers(q, filter, sort);
  const sortOptions: SheetOption[] = USER_SORTS.map((s) => ({
    key: `sort-${s}`,
    label: t(`admin.sort_${s}`),
    icon: s === sort ? 'checkmark' : s.startsWith('followers') ? 'people-outline' : s.startsWith('name') ? 'text-outline' : 'flame-outline',
    onPress: () => {
      setSortMenu(false);
      setSort(s);
    },
  }));
  return (
    <View style={{ flex: 1, gap: space.md }}>
      <SearchField testID="admin-user-search" placeholder={t('admin.searchUsers')} value={query} onChangeText={setQuery} autoCapitalize="none" />
      {/* flexGrow 0: numa coluna com flex, a fileira horizontal crescia e esticava os botões. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chips}
        contentContainerStyle={styles.chipsContent}
        accessibilityRole="tablist"
      >
        {USER_FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              testID={`admin-filter-${f}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(`admin.filter_${f}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable testID="admin-sort" accessibilityRole="button" onPress={() => setSortMenu(true)} style={styles.sortButton}>
        <Ionicons name="swap-vertical" size={16} color={colors.textMuted} />
        <Text style={styles.sortText}>
          {t('admin.sortBy')}: <Text style={{ color: colors.text }}>{t(`admin.sort_${sort}`)}</Text>
        </Text>
      </Pressable>
      <OptionsSheet visible={sortMenu} title={t('admin.sortBy')} options={sortOptions} onClose={() => setSortMenu(false)} />
      <FlatList
        {...listPerf}
        data={users.data ?? []}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => <UserRow user={item} />}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          users.isLoading ? <PeopleSkeleton count={5} /> : users.isError ? <ErrorState message={formatError(t, users.error)} onRetry={() => users.refetch()} /> : <Text style={[text.body, styles.empty]}>{t('admin.noUsers')}</Text>
        }
      />
    </View>
  );
}

function UserRow({ user: u }: { user: AdminUser }) {
  const { t } = useTranslation();
  const { verify, suspend } = useAdminActions();
  const [menu, setMenu] = useState(false);
  const suspended = isSuspended(u.suspended_until);
  const onError = (err: unknown) => notify(formatError(t, err));

  return (
    <View style={styles.card} testID={`admin-user-${u.username}`}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${u.username}`)} style={styles.row}>
        <RingAvatar uri={u.avatar_url} name={u.display_name} size={40} />
        <View style={{ flex: 1 }}>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {u.display_name}
            </Text>
            <Verified username={u.username} />
            {u.is_admin ? <Text style={styles.tag}>{t('admin.adminTag')}</Text> : null}
          </View>
          <Text style={styles.handle}>@{u.username}</Text>
        </View>
      </Pressable>
      <Text style={text.small}>
        {t('admin.followers', { count: u.follower_count ?? 0 })} · {t('admin.posts', { count: u.post_count })} · {t('admin.openReports', { count: u.open_reports })}
      </Text>
      {suspended ? (
        <Text style={[text.small, { color: colors.danger }]}>
          {u.suspended_until === 'infinity' ? t('admin.suspendedForever') : t('admin.suspendedUntil', { date: exactTime(u.suspended_until!) })}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          testID={`admin-verify-${u.username}`}
          size="sm"
          variant={u.verified ? 'ghost' : 'primary'}
          title={u.verified ? t('admin.unverify') : t('admin.verify')}
          onPress={() => verify.mutate({ userId: u.id, verified: !u.verified }, { onError })}
          loading={verify.isPending}
        />
        {u.is_admin ? null : suspended ? (
          <Button testID={`admin-unsuspend-${u.username}`} size="sm" variant="ghost" title={t('admin.unsuspend')} onPress={() => suspend.mutate({ userId: u.id, days: 0 }, { onError })} />
        ) : (
          <Button testID={`admin-suspend-${u.username}`} size="sm" variant="danger" title={t('admin.suspend')} onPress={() => setMenu(true)} />
        )}
      </View>
      <SuspendSheet visible={menu} username={u.username} onClose={() => setMenu(false)} onPick={(days) => suspend.mutate({ userId: u.id, days }, { onError })} />
    </View>
  );
}

// ---------------------------------------------------------------- destaques

function FeaturedTab() {
  const { t } = useTranslation();
  const featured = useFeaturedAdmin();
  const { addFeatured, removeFeatured } = useAdminActions();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [position, setPosition] = useState('100');

  const add = () =>
    addFeatured.mutate(
      { url, note, position: Math.max(0, Math.min(9999, Number.parseInt(position, 10) || 100)) },
      {
        onSuccess: () => {
          setUrl('');
          setNote('');
        },
        onError: (err) => notify(formatError(t, err)),
      },
    );

  return (
    <FlatList
      {...listPerf}
      data={featured.data ?? []}
      keyExtractor={(f) => f.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.md, paddingBottom: space.xxl }}
      ListHeaderComponent={
        <View style={[styles.card, { gap: space.md }]}>
          <TextField testID="featured-url" label={t('admin.featuredLink')} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
          <TextField testID="featured-note" label={t('admin.featuredNote')} value={note} onChangeText={setNote} maxLength={140} />
          <TextField testID="featured-position" label={t('admin.featuredPosition')} value={position} onChangeText={setPosition} keyboardType="number-pad" maxLength={4} />
          <Button testID="featured-add" title={t('admin.featuredAdd')} onPress={add} disabled={!url.trim()} loading={addFeatured.isPending} />
        </View>
      }
      renderItem={({ item: f }) => {
        const ended = hasEnded(f.ends_at);
        return (
          <View style={[styles.card, styles.row]} testID={`featured-${f.id}`}>
            {f.link_previews?.image_url ? <Image source={{ uri: f.link_previews.image_url }} style={styles.cover} /> : <View style={styles.cover} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name} numberOfLines={1}>
                {f.position}. {f.link_previews?.title ?? '—'}
              </Text>
              <Text style={text.small} numberOfLines={1}>
                {f.link_previews?.artist ?? ''}
                {ended ? ` · ${t('admin.featuredEnded')}` : ''}
              </Text>
              {f.note_pt ? (
                <Text style={styles.detail} numberOfLines={2}>
                  {f.note_pt}
                </Text>
              ) : null}
            </View>
            <Button size="sm" variant="ghost" title={t('admin.remove')} onPress={() => removeFeatured.mutate(f.id, { onError: (err) => notify(formatError(t, err)) })} />
          </View>
        );
      }}
      ListEmptyComponent={featured.isLoading ? <Spinner style={{ margin: space.lg }} /> : <Text style={[text.body, styles.empty]}>{t('admin.noFeatured')}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  wrap: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: space.lg, gap: space.md },
  overview: { textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  tag: { fontFamily: fonts.bold, fontSize: 11, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  tagDanger: { backgroundColor: colors.danger, color: colors.background },
  count: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMutedOnSurface },
  reasons: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  preview: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  detail: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMutedOnSurface, fontStyle: 'italic' },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: space.xl },
  chips: { flexGrow: 0, flexShrink: 0 },
  chipsContent: { gap: space.sm, alignItems: 'center' },
  chip: { alignSelf: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.surface, paddingHorizontal: space.md, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textMuted },
  chipTextOn: { color: colors.text },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
  sortText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  cover: { width: 48, height: 48, borderRadius: 6, backgroundColor: colors.surface },
});
