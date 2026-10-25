import { Platform, useWindowDimensions } from 'react-native';

/**
 * Layout do app pela largura da janela (só na web; no celular é sempre o de celular).
 * - mobile: abas embaixo, como no celular.
 * - desktop: barra lateral à esquerda e a tela no meio (Figma: Home e Discover, 1440 px).
 * - wide: também a coluna da direita (sugestões, mais ouvidas, curtidas e rodapé).
 */
export type WebLayout = 'mobile' | 'desktop' | 'wide';

/** Barra lateral (232) + tela (648): abaixo disso, o layout de celular. */
export const DESKTOP_MIN = 960;
/** + coluna da direita (~340) com folga. */
export const WIDE_MIN = 1280;

export function layoutFor(width: number, os: string = Platform.OS): WebLayout {
  if (os !== 'web') return 'mobile';
  if (width >= WIDE_MIN) return 'wide';
  if (width >= DESKTOP_MIN) return 'desktop';
  return 'mobile';
}

export function useWebLayout(): WebLayout {
  const { width } = useWindowDimensions();
  return layoutFor(width);
}

/** true quando a barra lateral substitui as abas de baixo (e o sino do topo). */
export function useIsDesktop(): boolean {
  return useWebLayout() !== 'mobile';
}

/**
 * CSS do esqueleto de abertura na web (vai no <head> do +html.tsx). O HTML gerado no servidor
 * traz o esqueleto de celular e o de desktop; isto mostra só o da largura da tela, antes mesmo
 * de o JavaScript rodar. Os testIDs são os do BootSkeleton (components/desktop/DesktopSkeleton).
 */
export const BOOT_SKELETON_CSS = [
  `@media (min-width: ${DESKTOP_MIN}px) { [data-testid="boot-mobile"] { display: none !important; } }`,
  `@media (max-width: ${DESKTOP_MIN - 0.02}px) { [data-testid="boot-desktop"] { display: none !important; } }`,
  `@media (max-width: ${WIDE_MIN - 0.02}px) { [data-testid="skeleton-desktop-panel"] { display: none !important; } }`,
].join('');
