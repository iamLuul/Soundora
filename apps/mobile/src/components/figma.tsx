// Peças visuais tiradas do Figma (Case Study UI/UX): ícones, logo, logos das plataformas,
// abas do topo com o sino e cabeçalho com a seta de voltar.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Platform as StreamingPlatform } from '@soundhora/core';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { logoSvg, platformSvgs } from '../assets/brand';
import { icons, type IconName } from '../assets/icons';
import { colors, fonts, glass, space } from '../theme';
import { Reactive } from './Reactive';
import { useUnreadNotifications } from '../lib/queries';
import { Avatar } from './ui';
import { webTouch } from '../lib/touch';
import { iconScale } from '../lib/display';
import { useIsDesktop } from '../lib/layout';
import { MessagesButton } from './messages/MessagesButton';

/** Tamanho natural de cada SVG (do viewBox), para manter a proporção. */
function svgSize(xml: string): { w: number; h: number } {
  const m = xml.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 24, h: 24 };
}

/** Ícone do Figma. `size` é a altura; a largura segue a proporção do desenho. */
export function Icon({ name, size: base = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  // Configurações › Acessibilidade › Tamanho dos ícones.
  const size = base * iconScale;
  const xml = icons[name];
  const { w, h } = svgSize(xml);
  return <SvgXml xml={xml} width={(size * w) / h} height={size} color={color} />;
}

/** Mascote + "Soundhora" (Figma: Login). */
export function Logo({ height = 108 }: { height?: number }) {
  const { w, h } = svgSize(logoSvg);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Soundhora">
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
/**
 * Deixa os ids internos do SVG (gradientes, máscaras) únicos por instância. Na Web, dois SVGs
 * com o mesmo id de gradiente se confundem: se o primeiro estiver numa tela escondida, o
 * segundo aparece sem a cor (o logo do Apple Music ficava só com a nota branca).
 */
export function uniqueSvgIds(xml: string, suffix: string): string {
  const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
  let out = xml;
  for (const id of ids) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\bid="${safe}"`, 'g'), `id="${id}-${suffix}"`)
      .replace(new RegExp(`url\\(#${safe}\\)`, 'g'), `url(#${id}-${suffix})`)
      .replace(new RegExp(`href="#${safe}"`, 'g'), `href="#${id}-${suffix}"`);
  }
  return out;
}

export function PlatformLogo({ platform, size = 20 }: { platform: StreamingPlatform; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const raw = platformSvgs[platform];
  const xml = useMemo(() => (raw ? uniqueSvgIds(raw, uid) : null), [raw, uid]);
  if (xml) return <SvgXml xml={xml} width={size} height={size} />;
  const f = PLATFORM_FALLBACK[platform] ?? { icon: 'musical-notes' as const, bg: colors.primary };
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={f.icon} size={size * 0.62} color="#FFFFFF" />
    </View>
  );
}

/**
 * Degradê do cartão de música de cada plataforma (do tom da marca para um vizinho mais fundo,
 * como no Figma "Home — NavBar Liquid Glass"). Texto branco com contraste 4.5:1 nas duas pontas.
 */
export const PLATFORM_GRADIENT: Record<StreamingPlatform, [string, string]> = {
  spotify: ['#1B7F45', '#146B5C'],
  apple_music: ['#D83A55', '#8E3BB8'],
  deezer: ['#8A3BE0', '#5A3BD6'],
  youtube: ['#D33A33', '#9A2B5A'],
  youtube_music: ['#D33A33', '#9A2B5A'],
  soundcloud: ['#C2531A', '#C23A4A'],
  tidal: ['#4A4A5C', '#23232E'],
  amazon_music: ['#1A7C89', '#3557C9'],
  bandcamp: ['#3F7E8C', '#2F5480'],
};

/** Cor de cada plataforma (contornos e detalhes). */
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
  showMessages = false,
  style,
}: {
  tabs: TopTab<T>[];
  value: T;
  onChange?: (value: T) => void;
  showBell?: boolean;
  /** Início: o ícone de mensagens no canto esquerdo (no computador ele fica na barra lateral). */
  showMessages?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  // Desktop: as notificações ficam na barra lateral.
  const desktop = useIsDesktop();
  // Três abas com os ícones dos lados (Início no celular): abas mais juntas, sem passar por baixo dos ícones.
  const compact = tabs.length >= 3 && !desktop && (showBell || showMessages);
  return (
    <View style={[styles.topTabs, desktop && styles.topTabsDesktop, style]}>
      <View style={[styles.tabsRow, compact && styles.tabsRowCompact]} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <Reactive
              key={tab.value}
              testID={`tab-${tab.value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange?.(tab.value)}
              pressScale={0.94}
              hitSlop={8}
              style={({ hovered }) => [webTouch(8), styles.tab, hovered && !active && styles.tabHover]}
            >
              <Text
                style={[styles.tabText, compact && styles.tabTextCompact, active && styles.tabActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tab.label}
              </Text>
              {/* A aba ativa ganha um traço com o degradê roxo embaixo, que aparece com uma mola. */}
              {active ? <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.tabIndicator} /> : null}
            </Reactive>
          );
        })}
      </View>
      {showMessages && !desktop ? <MessagesButton style={styles.messages} /> : null}
      {showBell && !desktop ? (
        <Pressable
          testID="open-notifications"
          accessibilityRole="button"
          accessibilityLabel={t('notifications.title')}
          onPress={() => router.push('/notifications')}
          hitSlop={12}
          style={[styles.bell, webTouch(12)]}
        >
          <Bell />
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
          style={[{ paddingVertical: 4, paddingRight: space.md }, webTouch(16, { vertical: 4, right: space.md })]}
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
  topTabsDesktop: { height: 64 },
  tabsRow: { flexDirection: 'row', justifyContent: 'center', gap: 36 },
  tabsRowCompact: { gap: 14, paddingHorizontal: 34 },
  tabTextCompact: { fontSize: 15 },
  tabText: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  tabActive: { fontFamily: fonts.bold },
  tab: { alignItems: 'center' },
  tabHover: { opacity: 0.75 },
  tabIndicator: {
    position: 'absolute',
    bottom: -7,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    backgroundImage: 'linear-gradient(90deg, #8A80FF 0%, #685EFF 100%)',
    boxShadow: '0 0 8px rgba(104, 94, 255, 0.7)',
  },
  bell: { position: 'absolute', right: 0, top: 12 },
  messages: { position: 'absolute', left: 0, top: 11 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.badge,
    // Contorno da cor do fundo: separa a bolinha do sino.
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.text },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backTitle: { fontFamily: fonts.regular, fontSize: 16, color: colors.text },
});

/**
 * Sino: vazado quando não há nada novo; preenchido de branco e com o número de
 * notificações não lidas quando há. Atualiza ao voltar para a tela e a cada 30 s.
 */
function Bell() {
  const { data: count = 0, refetch } = useUnreadNotifications();
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  return (
    <>
      <Icon name={count > 0 ? 'bellFilled' : 'bell'} size={20} />
      {count > 0 ? (
        <View testID="unread-badge" style={styles.badge} accessibilityLabel={String(count)}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </>
  );
}

/** Avatar com o anel roxo do Figma. `ring` = false tira o anel (nos posts, o anel só aparece para quem tem vibe ativa). */
export function RingAvatar({ uri, name, size = 38, ring = true }: { uri: string | null; name: string; size?: number; ring?: boolean }) {
  // Sem anel, a borda fica transparente: a foto mantém o mesmo tamanho e lugar.
  return (
    <View
      testID={ring ? 'avatar-ring' : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: ring ? colors.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Avatar uri={uri} name={name} size={size - 6} />
    </View>
  );
}

/** Campo de busca do Figma (Search page): fundo #322F42, borda fina, lupa à direita. */
export function SearchField(props: TextInputProps) {
  // Em foco: borda roxa e um brilho em volta.
  const [focused, setFocused] = useState(false);
  return (
    <View style={[searchStyles.box, focused && searchStyles.focused]}>
      <TextInput
        placeholderTextColor={colors.handle}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={props.placeholder}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
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
    minHeight: 40,
    borderRadius: 20,
    ...glass.chip,
    paddingHorizontal: 14,
    gap: space.sm,
  },
  focused: { borderColor: colors.primary, backgroundColor: 'rgba(104, 94, 255, 0.08)', boxShadow: '0 0 0 3px rgba(104, 94, 255, 0.22)' },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text, paddingVertical: 8, outlineWidth: 0 },
});
