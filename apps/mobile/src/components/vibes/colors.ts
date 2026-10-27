import type { VibeStyle } from '../../lib/api';

/** Cor principal de cada fundo (para as bolinhas de escolher o fundo). */
export const VIBE_BACKGROUND: Record<VibeStyle, string> = {
  violet: '#6C62FF',
  blue: '#3D7BFF',
  pink: '#D9508F',
  green: '#2F9E6E',
  orange: '#E9803A',
  dark: '#1E1C29',
};

/**
 * Degradê de cada fundo (de cima para baixo), como os fundos de texto dos Stories. O servidor
 * só guarda o nome; vibes antigas ganham o degradê do mesmo nome.
 */
export const VIBE_GRADIENT: Record<VibeStyle, [string, string]> = {
  violet: ['#4B3FD9', '#B46CFF'],
  blue: ['#1E4FD8', '#3FC6F2'],
  pink: ['#B8336A', '#FF8A8A'],
  green: ['#167A55', '#7FD36A'],
  orange: ['#D6334F', '#F7B733'],
  dark: ['#14121D', '#3A374C'],
};
