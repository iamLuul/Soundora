/** Barra de baixo (publicar, ao criar; quem viu, ao ver) e o espaço até ela. */
export const VIBE_BOTTOM_BAR = 72;

/**
 * O cartão da vibe na tela, igual ao criar e ao ver (assim os textos ficam no mesmo lugar):
 * 9:16, com a largura da tela, logo abaixo da barra de status, deixando a barra de baixo livre.
 * Em tela baixa (ou larga, como no computador), encolhe mantendo o 9:16.
 */
export function vibeCanvas(window: { width: number; height: number }, insets: { top: number; bottom: number }) {
  const top = insets.top + 4;
  const available = Math.max(200, window.height - top - insets.bottom - VIBE_BOTTOM_BAR);
  let width = Math.min(window.width, 520);
  let height = (width * 16) / 9;
  if (height > available) {
    height = available;
    width = (height * 9) / 16;
  }
  return { width, height, top, left: (window.width - width) / 2 };
}
