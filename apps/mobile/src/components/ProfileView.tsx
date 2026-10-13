import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockUser, fetchProfileSummary, setFollowing, type ProfileImageKind } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bannerUrl } from '../lib/avatar';
import { formatError } from '../lib/errors';
import { pickAndUploadProfileImage } from '../lib/pick-image';
import { keys, useProfilePosts, useVibesOf } from '../lib/queries';
import type { ProfileSummary } from '../lib/types';
import { colors, fonts, space, text } from '../theme';
import { TopTabs } from './figma';
import { OptionsSheet, type SheetOption } from './OptionsSheet';
import { FavoriteSongs, ProfileGenres, profileKeys } from './ProfileExtras';
import { ReviewList } from './ReviewList';
import { PostList } from './PostList';
import { Avatar } from './ui';
import { ProfileSkeleton } from './Skeleton';
import { webTouch } from '../lib/touch';
import { Spinner } from './Spinner';
import { Verified } from './Verified';
import { notify } from '../lib/dialogs';
import { showToast } from './Toast';
import { ErrorState } from './ErrorState';

/** Medidas do Figma (Profile page, 430 px): banner 120, foto 72 com anel de 8, cartões 42. */
export const PROFILE_LAYOUT = { banner: 120, avatar: 72, ring: 8, overlap: 44, card: 42, gap: 12, margin: 20 };


/** Números grandes como no Figma: 1.7k, 16.6k. */
export function compactNumber(n: number, locale: string): string {
  if (n < 1000) return String(n);
  const value = n >= 1_000_000 ? n / 1_000_000 : n / 1000;
  const suffix = n >= 1_000_000 ? 'M' : 'k';
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString(locale)}${suffix}`;
}

/**
 * Perfil (aba "Perfil" e /u/[username]), no layout do Figma: banner no topo, foto
 * centralizada sobre o banner, nome e @ embaixo, números nos cartões dos lados, bio e posts.
 * `underStatusBar`: o banner vai até o topo da tela (aba Perfil, sem cabeçalho).
 */
export function ProfileView({ username, underStatusBar = false }: { username: string; underStatusBar?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'posts' | 'reviews'>('posts');
  const summary = useQuery({ queryKey: keys.profile(username), queryFn: () => fetchProfileSummary(username) });
  const posts = useProfilePosts(summary.data?.id);

  if (summary.isLoading) return <ProfileSkeleton />;
  const p = summary.data;
  if (summary.isError) return <ErrorState message={formatError(t, summary.error)} onRetry={() => summary.refetch()} />;
  if (!p) return <Text style={[text.body, { textAlign: 'center', marginTop: space.xxl, color: colors.textMuted }]}>{t('profile.notFound')}</Text>;

  // Ao puxar: números, gêneros, favoritas e vibes também.
  const refreshExtras = () =>
    Promise.all([
      summary.refetch(),
      qc.invalidateQueries({ queryKey: profileKeys.favorites(p.id) }),
      qc.invalidateQueries({ queryKey: profileKeys.genres(p.id) }),
      qc.invalidateQueries({ queryKey: keys.vibesOf(p.id) }),
    ]);

  // Figma (Profile page): duas seções embaixo, Posts e Reviews.
  const header = (
    <View>
      <ProfileHeader profile={p} underStatusBar={underStatusBar} />
      <TopTabs<'posts' | 'reviews'>
        value={tab}
        onChange={setTab}
        showBell={false}
        style={styles.tabs}
        tabs={[
          { value: 'posts', label: t('profile.tabPosts') },
          { value: 'reviews', label: t('profile.tabReviews') },
        ]}
      />
    </View>
  );

  if (tab === 'reviews') {
    return <ReviewList filter={{ author: p.id }} header={header} padded emptyText={t('profile.noReviews')} onRefresh={refreshExtras} />;
  }
  return (
    <PostList
      header={header}
      items={posts.data?.pages.flat() ?? []}
      loading={false}
      onRefresh={() => Promise.all([refreshExtras(), posts.refetch()])}
      onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
      loadingMore={posts.isFetchingNextPage}
      emptyText={t('profile.noPosts')}
    />
  );
}

export function ProfileHeader({ profile: p, underStatusBar = false }: { profile: ProfileSummary; underStatusBar?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState<ProfileImageKind | null>(null);

  const vibes = useVibesOf(p.id);
  const hasVibes = (vibes.data?.length ?? 0) > 0;
  const unseenVibes = !!vibes.data?.some((v) => !v.seen);
  const topInset = underStatusBar ? insets.top : 0;
  const bannerHeight = Math.max(PROFILE_LAYOUT.banner, topInset + 76);
  const banner = bannerUrl(p.banner_url);
  const n = (v: number) => compactNumber(v, i18n.language);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: keys.profile(p.username) });
    await qc.invalidateQueries({ queryKey: keys.feed });
  };

  const changeImage = async (kind: ProfileImageKind) => {
    setUploading(kind);
    try {
      const saved = await pickAndUploadProfileImage(kind);
      if (saved) {
        await refresh();
        await refreshProfile();
      }
    } catch (err) {
      notify(formatError(t, err));
    } finally {
      setUploading(null);
    }
  };

  const toggleFollow = async () => {
    try {
      await setFollowing(p.id, !p.i_follow);
      await refresh();
      // A fila de quem você segue, no topo da Home.
      for (const queryKey of [['following'], keys.followingIds, keys.followingFeed, keys.vibesTray]) void qc.invalidateQueries({ queryKey });
    } catch (err) {
      notify(formatError(t, err));
    }
  };

  const options: SheetOption[] = p.is_me
    ? [
        { key: 'edit', label: t('profile.edit'), icon: 'create-outline', onPress: () => router.push('/settings/profile') },
        { key: 'photo', label: t('profile.changePhoto'), icon: 'person-circle-outline', onPress: () => changeImage('avatar') },
        { key: 'banner', label: t('profile.changeBanner'), icon: 'image-outline', onPress: () => changeImage('banner') },
        { key: 'settings', label: t('settings.title'), icon: 'settings-outline', onPress: () => router.push('/settings') },
      ]
    : [
        {
          key: 'block',
          label: t('feed.block', { username: p.username }),
          icon: 'remove-circle-outline',
          danger: true,
          onPress: async () => {
            try {
              await blockUser(p.id);
              showToast(t('feed.blocked', { username: p.username }));
              await qc.invalidateQueries();
              router.back();
            } catch (err) {
              notify(formatError(t, err));
            }
          },
        },
      ];

  return (
    <View style={styles.header}>
      {/* Banner */}
      <Pressable
        testID="profile-banner"
        disabled={!p.is_me || !!uploading}
        onPress={() => changeImage('banner')}
        accessibilityRole={p.is_me ? 'button' : 'image'}
        accessibilityLabel={p.is_me ? t('profile.changeBanner') : t('profile.banner')}
        style={[styles.banner, { height: bannerHeight }]}
      >
        {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : <BannerPlaceholder />}
        {uploading === 'banner' ? <Spinner color={colors.text} style={StyleSheet.absoluteFill} /> : null}
      </Pressable>

      <Pressable
        testID="profile-menu"
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('profile.options')}
        hitSlop={12}
        style={[styles.menuButton, { top: topInset + space.sm }, webTouch(12)]}
      >
        <Ionicons name="ellipsis-vertical" size={14} color={colors.text} />
      </Pressable>

      {/* Foto no centro, sobre o banner, com os cartões de números dos lados */}
      {/* box-none: a faixa que cobre o pé do banner não rouba o toque dele */}
      <View style={styles.identityRow} pointerEvents="box-none">
        <View style={styles.side} pointerEvents="box-none">
          <StatCard
            testID="stat-followers"
            label={t('profile.followers')}
            value={n(p.followers)}
            onPress={() => router.push({ pathname: '/people/[username]', params: { username: p.username, list: 'followers' } })}
          />
          <StatCard
            testID="stat-following"
            label={t('profile.following')}
            value={n(p.following)}
            onPress={() => router.push({ pathname: '/people/[username]', params: { username: p.username, list: 'following' } })}
          />
        </View>

        <View style={styles.center}>
          <View>
            {/* Com vibes ativas: argola (roxa se tem vibe não vista) e tocar abre as vibes. */}
            <Pressable
              testID="profile-avatar"
              disabled={hasVibes ? false : !p.is_me || !!uploading}
              onPress={() => (hasVibes ? router.push({ pathname: '/vibes/[author]', params: { author: p.id } }) : changeImage('avatar'))}
              accessibilityRole={hasVibes || p.is_me ? 'button' : 'image'}
              accessibilityLabel={hasVibes ? t('profile.seeVibes', { name: p.display_name }) : p.is_me ? t('profile.changePhoto') : p.display_name}
              style={[styles.avatarRing, hasVibes && { borderWidth: 3, borderColor: unseenVibes || p.is_me ? colors.primary : colors.handle }]}
            >
              <View testID={hasVibes ? 'profile-vibes-ring' : undefined} style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Avatar uri={p.avatar_url} name={p.display_name} size={PROFILE_LAYOUT.avatar} />
              </View>
              {uploading === 'avatar' ? <Spinner color={colors.text} style={StyleSheet.absoluteFill} /> : null}
            </Pressable>
            {p.is_me && !hasVibes ? (
              <View style={styles.avatarEdit} pointerEvents="none">
                <Ionicons name="camera" size={12} color={colors.text} />
              </View>
            ) : p.is_me ? (
              // Com vibes, tocar na foto abre as vibes; a câmera continua trocando a foto.
              <Pressable
                testID="change-avatar"
                accessibilityRole="button"
                accessibilityLabel={t('profile.changePhoto')}
                disabled={!!uploading}
                onPress={() => changeImage('avatar')}
                hitSlop={6}
                style={styles.avatarEdit}
              >
                <Ionicons name="camera" size={12} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
              {p.display_name}
            </Text>
            <Verified username={p.username} size={12} />
          </View>
          <Text style={styles.handle} numberOfLines={1}>
            @{p.username}
          </Text>
          {p.is_me ? (
            <Pill testID="edit-profile" label={t('profile.edit')} onPress={() => router.push('/settings/profile')} />
          ) : (
            <Pill
              testID="follow-button"
              accessibilityHint={p.i_follow ? t('profile.unfollow') : undefined}
              label={p.i_follow ? t('profile.followingButton') : t('profile.follow')}
              variant={p.i_follow ? 'outline' : 'primary'}
              onPress={toggleFollow}
            />
          )}
        </View>

        <View style={styles.side} pointerEvents="box-none">
          <StatCard label={t('profile.posts')} value={n(p.posts)} />
          <StatCard
            testID="stat-likes"
            label={t('profile.likes')}
            value={n(p.likes)}
            onPress={() => router.push({ pathname: '/liked/[username]', params: { username: p.username, id: p.id } })}
          />
        </View>
      </View>

      <ProfileGenres userId={p.id} />

      {p.bio ? (
        <View style={styles.bioCard}>
          <Text style={styles.bio}>{p.bio}</Text>
        </View>
      ) : null}

      <FavoriteSongs userId={p.id} isMe={p.is_me} />

      <OptionsSheet visible={menuOpen} title={`@${p.username}`} options={options} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

/** Cartão de número do perfil. Com onPress, abre a lista (seguidores, seguindo, curtidas). */
function StatCard({ label, value, onPress, testID }: { label: string; value: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.75 }]}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
    </Pressable>
  );
}

function Pill({
  label,
  onPress,
  variant = 'primary',
  testID,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  testID?: string;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pill, variant === 'outline' && styles.pillOutline, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/** Sem banner: um tom só da paleta do Soundora (roxo sobre o cinza-arroxeado). */
function BannerPlaceholder() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary, opacity: 0.35 }]} />
    </View>
  );
}

const L = PROFILE_LAYOUT;
const ringSize = L.avatar + L.ring * 2;

const styles = StyleSheet.create({
  // Sangra as margens da lista para o banner ir de ponta a ponta.
  header: { marginHorizontal: -space.lg, marginBottom: space.lg, gap: space.lg },
  banner: { width: '100%', backgroundColor: colors.surface, overflow: 'hidden' },
  menuButton: {
    position: 'absolute',
    right: 23,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingHorizontal: L.margin,
    marginTop: -L.overlap - space.lg, // a foto sobe sobre o banner (desconta o gap do header)
  },
  side: { flex: 1, gap: L.gap, paddingTop: L.overlap + 20 },
  center: { alignItems: 'center', minWidth: ringSize, maxWidth: 150 },
  avatarRing: {
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    right: L.ring - 2,
    bottom: L.ring - 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, textAlign: 'center' },
  handle: { fontFamily: fonts.regular, fontSize: 12, color: colors.handle, textAlign: 'center', marginTop: 2 },
  pill: { marginTop: space.md, minHeight: 28, paddingHorizontal: space.lg, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pillOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  pillText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  statCard: { minHeight: L.card, borderRadius: 10, backgroundColor: colors.card, paddingHorizontal: space.md, paddingVertical: 5, justifyContent: 'center' },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  statValue: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  bioCard: { marginHorizontal: L.margin, borderRadius: 10, backgroundColor: colors.card, paddingHorizontal: space.sm + 4, paddingVertical: space.sm },
  bio: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.text },
  tabs: { justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.handle, marginBottom: space.sm },
});

