import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blockUser, fetchProfileSummary, setFollowing, type ProfileImageKind } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bannerUrl } from '../lib/avatar';
import { errorStatus, formatError } from '../lib/errors';
import { ErrorScreen } from './ErrorScreen';
import { openConversationWith } from './messages/open';
import { pickAndUploadProfileImage } from '../lib/pick-image';
import { keys, useProfilePosts, useVibesOf } from '../lib/queries';
import type { ProfileSummary } from '../lib/types';
import { colors, fonts, glass, gradients, radius, space } from '../theme';
import { Reactive } from './Reactive';
import { TopTabs } from './figma';
import { OptionsSheet, type SheetOption } from './OptionsSheet';
import { AccountSwitcher } from './AccountSwitcher';
import { FavoriteSongs, ProfileGenres, profileKeys } from './ProfileExtras';
import { ProfileBadges } from './ProfileBadges';
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
import { useTabBarInset } from './TabBar';

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
  const tabInset = useTabBarInset();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const [tab, setTab] = useState<'posts' | 'reviews'>('posts');
  const summary = useQuery({ queryKey: keys.profile(username), queryFn: () => fetchProfileSummary(username) });
  // Conta privada trancada para mim: nem busca os posts.
  const posts = useProfilePosts(summary.data?.locked ? undefined : summary.data?.id);

  if (summary.isLoading) return <ProfileSkeleton />;
  const p = summary.data;
  if (summary.isError) {
    const status = errorStatus(summary.error);
    return status === 401 || status === 403 || status === 404 ? (
      <ErrorScreen code={status} fullScreen={false} onSignIn={signOut} />
    ) : (
      <ErrorState message={formatError(t, summary.error)} onRetry={() => summary.refetch()} />
    );
  }
  // @ que não existe: a tela 404.
  if (!p) return <ErrorScreen code={404} fullScreen={false} testID="profile-not-found" />;

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

  // Conta privada que eu não sigo: o cabeçalho aparece, o conteúdo não.
  if (p.locked) {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl + tabInset }}>
        <ProfileHeader profile={p} underStatusBar={underStatusBar} />
        <View testID="profile-locked" style={styles.locked}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} />
          <Text style={styles.lockedTitle}>{t('profile.privateTitle')}</Text>
          <Text style={styles.lockedBody}>{p.requested ? t('profile.privateRequested') : t('profile.privateBody')}</Text>
        </View>
      </ScrollView>
    );
  }

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
  const [switcherOpen, setSwitcherOpen] = useState(false);
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
      // Seguindo ou com pedido pendente: o botão desfaz (deixa de seguir ou desiste do pedido).
      const status = await setFollowing(p.id, !(p.i_follow || p.requested));
      if (status === 'requested') showToast(t('toast.followRequested'));
      await refresh();
      // A fila de quem você segue, no topo da Home.
      for (const queryKey of [['following'], keys.followingIds, keys.requestedIds, keys.followingFeed, keys.vibesTray]) void qc.invalidateQueries({ queryKey });
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
        {
          key: 'switch-account',
          label: t('accounts.switch'),
          icon: 'people-outline',
          // Espera o menu fechar (no iOS, um modal não abre enquanto outro está saindo).
          onPress: () => setTimeout(() => setSwitcherOpen(true), 350),
        },
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
        {banner ? (
          <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <BannerPlaceholder />
        )}
        {/* O pé do banner esmaece no fundo (a foto e os números "flutuam" sobre ele). */}
        <View pointerEvents="none" style={styles.bannerFade} />
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
            onPress={p.locked ? undefined : () => router.push({ pathname: '/people/[username]', params: { username: p.username, list: 'followers' } })}
          />
          <StatCard
            testID="stat-following"
            label={t('profile.following')}
            value={n(p.following)}
            onPress={p.locked ? undefined : () => router.push({ pathname: '/people/[username]', params: { username: p.username, list: 'following' } })}
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
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pill
                testID="follow-button"
                accessibilityHint={p.i_follow ? t('profile.unfollow') : p.requested ? t('profile.cancelRequest') : undefined}
                label={p.i_follow ? t('profile.followingButton') : p.requested ? t('profile.requested') : t('profile.follow')}
                variant={p.i_follow || p.requested ? 'outline' : 'primary'}
                onPress={toggleFollow}
              />
              <Pill
                testID="message-button"
                label={t('messages.messageButton')}
                variant="outline"
                onPress={() => void openConversationWith(p).catch((err) => notify(formatError(t, err)))}
              />
            </View>
          )}
        </View>

        <View style={styles.side} pointerEvents="box-none">
          <StatCard label={t('profile.posts')} value={n(p.posts)} />
          <StatCard
            testID="stat-likes"
            label={t('profile.likes')}
            value={n(p.likes)}
            onPress={p.locked ? undefined : () => router.push({ pathname: '/liked/[username]', params: { username: p.username, id: p.id } })}
          />
        </View>
      </View>

      <ProfileGenres userId={p.id} />

      {p.bio ? (
        <View style={styles.bioCard}>
          <Text style={styles.bio}>{p.bio}</Text>
        </View>
      ) : null}

      {/* Selos (só exibição), entre a bio e as músicas favoritas. */}
      <ProfileBadges userId={p.id} />

      <FavoriteSongs userId={p.id} isMe={p.is_me} />

      <OptionsSheet visible={menuOpen} title={`@${p.username}`} options={options} onClose={() => setMenuOpen(false)} />
      {p.is_me ? <AccountSwitcher visible={switcherOpen} onClose={() => setSwitcherOpen(false)} /> : null}
    </View>
  );
}

/** Cartão de número do perfil. Com onPress, abre a lista (seguidores, seguindo, curtidas). */
function StatCard({ label, value, onPress, testID }: { label: string; value: string; onPress?: () => void; testID?: string }) {
  return (
    <Reactive
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      pressScale={0.95}
      hoverScale={onPress ? 1.03 : 1}
      style={({ hovered }) => [styles.statCard, hovered && !!onPress && styles.statHover]}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
    </Reactive>
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
    <Reactive
      testID={testID}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      onPress={onPress}
      pressScale={0.93}
      hoverScale={1.04}
      style={[styles.pill, variant === 'outline' && styles.pillOutline]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </Reactive>
  );
}

/** Sem banner: um tom só da paleta do Soundhora (roxo sobre o cinza-arroxeado). */
function BannerPlaceholder() {
  return <View style={[StyleSheet.absoluteFill, styles.placeholder]} />;
}

const L = PROFILE_LAYOUT;
const ringSize = L.avatar + L.ring * 2;

const styles = StyleSheet.create({
  locked: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl, marginTop: space.xl },
  lockedTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, textAlign: 'center' },
  lockedBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  // Sangra as margens da lista para o banner ir de ponta a ponta.
  header: { marginHorizontal: -space.lg, marginBottom: space.lg, gap: space.lg },
  // Banner com os cantos de baixo arredondados.
  banner: { width: '100%', backgroundColor: colors.surface, overflow: 'hidden', borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  bannerFade: { ...StyleSheet.absoluteFill, backgroundImage: 'linear-gradient(180deg, rgba(58, 55, 76, 0) 50%, rgba(58, 55, 76, 0.55) 100%)' },
  // Sem banner: o degradê da marca (roxo para o cinza-arroxeado, com um toque de rosa).
  placeholder: {
    backgroundColor: colors.surface,
    backgroundImage: 'linear-gradient(135deg, rgba(104, 94, 255, 0.85) 0%, rgba(90, 85, 119, 1) 60%, rgba(253, 81, 99, 0.45) 120%)',
  },
  menuButton: {
    position: 'absolute',
    right: 23,
    width: 28,
    height: 28,
    borderRadius: 14,
    ...glass.chip,
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
    // Anel com um brilho roxo de cima (vidro sobre o fundo).
    backgroundImage: 'linear-gradient(160deg, rgba(138, 128, 255, 0.55) 0%, rgba(58, 55, 76, 1) 60%)',
    boxShadow: '0 8px 24px rgba(10, 6, 30, 0.3)',
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
  pill: {
    marginTop: space.md,
    minHeight: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    backgroundImage: gradients.primary,
    boxShadow: '0 6px 16px rgba(104, 94, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOutline: { ...glass.chip, backgroundImage: 'none', boxShadow: 'none', borderColor: 'rgba(138, 128, 255, 0.7)' },
  pillText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  statCard: { minHeight: L.card, borderRadius: 18, ...glass.card, paddingHorizontal: space.md, paddingVertical: 5, justifyContent: 'center' },
  statHover: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.text },
  statValue: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  bioCard: { marginHorizontal: L.margin, borderRadius: 18, ...glass.card, paddingHorizontal: space.sm + 4, paddingVertical: space.sm },
  bio: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.text },
  tabs: { justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(177, 172, 208, 0.3)', marginBottom: space.sm },
});
