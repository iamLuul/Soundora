import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconName } from '../../assets/icons';
import { useAuth } from '../../lib/auth';
import { confirmAction } from '../../lib/dialogs';
import { useUnreadNotifications } from '../../lib/queries';
import { colors, fonts, space } from '../../theme';
import { Icon, Logo } from '../figma';
import { Avatar } from '../ui';

interface NavItem {
  key: string;
  href: Href;
  label: string;
  icon: IconName | 'settings';
  /** A tela atual é desta seção? */
  active: (path: string) => boolean;
}

/**
 * Barra lateral do desktop (Figma: Home e Discover, 1440 px): logo, as seções do app, o botão
 * Postar e a conta embaixo (perfil e sair). Substitui as abas de baixo e o sino.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const path = usePathname();
  const { profile } = useAuth();
  const unread = useUnreadNotifications().data ?? 0;

  const items: NavItem[] = [
    { key: 'home', href: '/', label: t('desktop.home'), icon: 'home', active: (p) => p === '/' },
    { key: 'discover', href: '/discover', label: t('tabs.discover'), icon: 'search', active: (p) => p.startsWith('/discover') || p.startsWith('/genre') },
    { key: 'notifications', href: '/notifications', label: t('notifications.title'), icon: 'bell', active: (p) => p.startsWith('/notifications') },
    { key: 'music', href: '/music', label: t('tabs.music'), icon: 'music', active: (p) => p.startsWith('/music') || p.startsWith('/album') },
    {
      key: 'profile',
      href: '/me',
      label: t('tabs.profile'),
      icon: 'profile',
      active: (p) => p === '/me' || (!!profile && p === `/u/${profile.username}`),
    },
    { key: 'settings', href: '/settings', label: t('settings.title'), icon: 'settings', active: (p) => p.startsWith('/settings') },
  ];

  return (
    <View style={styles.bar} role="navigation" aria-label={t('desktop.sidebar')}>
      <Pressable accessibilityRole="link" accessibilityLabel={t('desktop.home')} onPress={() => router.navigate('/')} style={styles.logo}>
        <Logo height={64} />
      </Pressable>

      <View style={styles.nav}>
        {items.map((item) => {
          const active = item.active(path);
          const color = active ? colors.text : colors.muted;
          return (
            <Pressable
              key={item.key}
              testID={`side-${item.key}`}
              accessibilityRole="link"
              accessibilityLabel={item.key === 'notifications' && unread > 0 ? `${item.label} (${unread})` : item.label}
              accessibilityState={{ selected: active }}
              aria-current={active ? 'page' : undefined}
              onPress={() => router.navigate(item.href)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.item, (hovered || pressed) && styles.itemHover]}
            >
              <View style={styles.icon}>
                {item.icon === 'settings' ? <Ionicons name="settings-outline" size={24} color={color} /> : <Icon name={item.icon} size={24} color={color} />}
                {item.key === 'notifications' && unread > 0 ? (
                  <View style={styles.badge} testID="side-unread">
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color }, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        testID="side-post"
        accessibilityRole="button"
        onPress={() => router.navigate('/compose')}
        style={({ pressed }) => [styles.post, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.postText}>{t('tabs.compose')}</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      {profile ? <AccountChip name={profile.display_name} username={profile.username} avatar={profile.avatar_url} /> : null}
    </View>
  );
}

/** A conta logada (Figma: Frame 350): abre o menu com Ver perfil e Sair. */
function AccountChip({ name, username, avatar }: { name: string; username: string; avatar: string | null }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const leave = async () => {
    setOpen(false);
    if (await confirmAction(t('confirm.signOut'), t('profile.signOut'), t('common.cancel'))) await signOut();
  };
  return (
    <View>
      {open ? (
        <View style={styles.menu} testID="side-account-menu">
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              setOpen(false);
              router.navigate('/me');
            }}
            style={styles.menuItem}
          >
            <Text style={styles.menuText}>{t('desktop.viewProfile')}</Text>
          </Pressable>
          <Pressable testID="side-sign-out" accessibilityRole="button" onPress={leave} style={styles.menuItem}>
            <Text style={[styles.menuText, { color: colors.danger }]}>{t('profile.signOut')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        testID="side-account"
        accessibilityRole="button"
        accessibilityLabel={t('desktop.account')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.account}
      >
        <Avatar uri={avatar} name={name} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.accountName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.accountHandle} numberOfLines={1}>
            @{username}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: 232, flexShrink: 0, paddingTop: 26, paddingBottom: space.xl, paddingRight: space.lg, height: '100%' },
  logo: { alignSelf: 'flex-start', marginLeft: 12, marginBottom: space.lg },
  nav: { gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 48, borderRadius: 24, paddingHorizontal: space.sm },
  itemHover: { backgroundColor: 'rgba(179, 169, 235, 0.1)' },
  icon: { width: 28, alignItems: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 16 },
  labelActive: { fontFamily: fonts.bold },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.badge,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.text },
  post: { marginTop: space.xxl, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  postText: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 50, borderRadius: 25, backgroundColor: colors.card, paddingLeft: 5, paddingRight: space.lg },
  accountName: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  accountHandle: { fontFamily: fonts.regular, fontSize: 10, color: colors.handle },
  menu: { backgroundColor: colors.card, borderRadius: 14, paddingVertical: space.xs, marginBottom: space.sm, borderWidth: 1, borderColor: colors.border },
  menuItem: { paddingHorizontal: space.lg, paddingVertical: space.md },
  menuText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
