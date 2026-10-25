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

/**
 * Web: com o mouse por cima de qualquer coisa clicável (botões, links, abas, cartões que abrem
 * algo), o fundo ganha o mesmo destaque da navegação da barra lateral. É uma camada por cima
 * da cor de fundo e por baixo do conteúdo (background-image), então respeita os cantos
 * arredondados e não mexe em sombras. Botões de fundo cheio (roxo, branco, vermelho) escurecem
 * em vez disso (data-hover="darken", marcado por installHoverMarks). Só em aparelhos com mouse
 * (no toque o destaque ficaria "preso" depois do toque). Desativados e campos de texto não mudam.
 */
export const HOVER_CSS = [
  '@media (hover: hover) {',
  ':is([tabindex="0"], a[href]):not(input, textarea, [aria-disabled="true"], [data-hover="darken"]):hover {',
  '  background-image: linear-gradient(rgba(179, 169, 235, 0.1), rgba(179, 169, 235, 0.1));',
  '}',
  '[data-hover="darken"]:not([aria-disabled="true"]):hover { filter: brightness(0.88); }',
  '}',
].join('');

const CLICKABLE = '[tabindex="0"], a[href]';

/** Fundo cheio (cor sólida, não transparente nem translúcida)? */
function solidBackground(el: Element): boolean {
  const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const alpha = m[1]!.split(',')[3];
  return alpha === undefined || Number(alpha) >= 0.9;
}

/**
 * Web: ao passar o mouse, marca o botão com fundo cheio para escurecer (ver HOVER_CSS). Olha a
 * cor na hora (um botão "Seguir" que vira "Seguindo" sem fundo passa a ganhar o destaque normal).
 * Devolve a função que desliga.
 */
export function installHoverMarks(): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => undefined;
  const onOver = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.(CLICKABLE);
    if (!(el instanceof HTMLElement) || el.matches('input, textarea')) return;
    if (solidBackground(el)) el.dataset.hover = 'darken';
    else delete el.dataset.hover;
  };
  document.addEventListener('pointerover', onOver, true);
  return () => document.removeEventListener('pointerover', onOver, true);
}
