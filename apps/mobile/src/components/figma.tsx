// Peças visuais tiradas do Figma (Case Study UI/UX): ícones, logo, logos das plataformas,
// abas do topo com o sino e cabeçalho com a seta de voltar.
import { Ionicons } from '@expo/vector-icons';
import type { Platform as StreamingPlatform } from '@soundora/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { logoSvg, platformSvgs } from '../assets/brand';
import { icons, type IconName } from '../assets/icons';
import { colors, fonts, space } from '../theme';
import { useUnreadNotifications } from '../lib/queries';
import { Avatar } from './ui';

/** Tamanho natural de cada SVG (do viewBox), para manter a proporção. */
function svgSize(xml: string): { w: number; h: number } {
  const m = xml.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 24, h: 24 };
}

/** Ícone do Figma. `size` é a altura; a largura segue a proporção do desenho. */
export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  const xml = icons[name];
  const { w, h } = svgSize(xml);
  return <SvgXml xml={xml} width={(size * w) / h} height={size} color={color} />;
}

/** Mascote + "Soundora." (Figma: Login). */
export function Logo({ height = 108 }: { height?: number }) {
  const { w, h } = svgSize(logoSvg);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Soundora">
      <SvgXml xml={logoSvg} width={(height * w) / h} height={height} />
    </View>
  );
}

const PLATFORM_FALLBACK: Partial<Record<StreamingPlatform, { icon: keyof typeof Ionicons.glyphMap; bg: string }>> = {
  youtube: { icon: 'logo-youtube', bg: '#FF0000' },
  youtube_music: { icon: 'logo-youtube', bg: '#FF0000' },
  soundcloud: { icon: 'logo-soundcloud', bg: '#FF5500' },
  tidal: { icon: 'musical-notes', bg: '#000000' },
  bandcamp: { icon: 'musical-notes', bg: '#629AA9' },
};

/** Logo da plataforma de streaming (Spotify, Apple Music, Deezer e Amazon vêm do Figma). */
export function PlatformLogo({ platform, size = 20 }: { platform: StreamingPlatform; size?: number }) {
  const xml = platformSvgs[platform];
  if (xml) return <SvgXml xml={xml} width={size} height={size} />;
  const f = PLATFORM_FALLBACK[platform] ?? { icon: 'musical-notes' as const, bg: colors.primary };
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={f.icon} size={size * 0.62} color="#FFFFFF" />
    </View>
  );
}

/** Cor de cada plataforma, usada no contorno e no fundo do cartão de música. */
export const PLATFORM_ACCENT: Record<StreamingPlatform, string> = {
  spotify: '#B7FF95',
  apple_music: '#FD5163',
  deezer: '#A238FF',
  youtube: '#FF4E45',
  youtube_music: '#FF4E45',
  soundcloud: '#FF7700',
  tidal: '#FFFFFF',
  amazon_music: '#25D1DA',
  bandcamp: '#629AA9',
};

export interface TopTab<T extends string> {
  value: T;
  label: string;
}

/**
 * Abas do topo das telas principais (Figma: "For you | Videos | Reviews",
 * "Discover | Trending | Search"): texto 16, ativa em negrito, sino à direita.
 */
export function TopTabs<T extends string>({
  tabs,
  value,
  onChange,
  showBell = true,
  style,
}: {
  tabs: TopTab<T>[];
  value: T;
  onChange?: (value: T) => void;
  showBell?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.topTabs, style]}>
      <View style={styles.tabsRow} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <Pressable
              key={tab.value}
              testID={`tab-${tab.value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange?.(tab.value)}
              hitSlop={8}
            >
              <Text style={[styles.tabText, active && styles.tabActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {showBell ? (
        <Pressable
          testID="open-notifications"
          accessibilityRole="button"
          accessibilityLabel={t('notifications.title')}
          onPress={() => router.push('/notifications')}
          hitSlop={12}
          style={styles.bell}
        >
          <Icon name="bell" size={20} />
          <UnreadDot />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Seta de voltar + título à esquerda (Figma: "Check your email", "Username and Password"). */
export function BackHeader({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.backRow}>
        <Pressable
          testID="back"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          hitSlop={16}
          style={{ paddingVertical: 4, paddingRight: space.md }}
        >
          <Icon name="back" size={18} />
        </Pressable>
        {right}
      </View>
      {title ? (
        <Text style={styles.backTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topTabs: { height: 44, justifyContent: 'center' },
  tabsRow: { flexDirection: 'row', justifyContent: 'center', gap: 36 },
  tabText: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  tabActive: { fontFamily: fonts.bold },
  bell: { position: 'absolute', right: 0, top: 12 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.text },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backTitle: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
});

/** Bolinha com o número de notificações não lidas, em cima do sino. */
function UnreadDot() {
  const { data: count = 0 } = useUnreadNotifications();
  if (count <= 0) return null;
  return (
    <View testID="unread-badge" style={styles.badge} accessibilityLabel={String(count)}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/** Avatar com o anel roxo do Figma (posts e fila de quem você segue). */
export function RingAvatar({ uri, name, size = 38 }: { uri: string | null; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Avatar uri={uri} name={name} size={size - 6} />
    </View>
  );
}

/** Campo de busca do Figma (Search page): fundo #322F42, borda fina, lupa à direita. */
export function SearchField(props: TextInputProps) {
  return (
    <View style={searchStyles.box}>
      <TextInput
        placeholderTextColor={colors.handle}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={props.placeholder}
        {...props}
        style={searchStyles.input}
      />
      <Icon name="searchField" size={18} color={colors.handle} />
    </View>
  );
}

const searchStyles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.handle,
    backgroundColor: colors.card,
    paddingHorizontal: 11,
    gap: space.sm,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text, paddingVertical: 8, outlineWidth: 0 },
});
