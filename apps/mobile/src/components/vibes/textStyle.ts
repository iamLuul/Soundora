import { Platform, type TextStyle } from 'react-native';
import type { VibeFont, VibeKind, VibeTextBg, VibeTextColor, VibeTextItem } from '../../lib/api';
import { fonts } from '../../theme';

/** Cores dos textos da vibe (o servidor só guarda o nome). */
export const TEXT_COLOR: Record<VibeTextColor, string> = {
  white: '#FFFFFF',
  black: '#000000',
  violet: '#8B83FF',
  blue: '#4D8BFF',
  cyan: '#2EC5E6',
  green: '#3DD68C',
  yellow: '#FFD60A',
  orange: '#FF8A3D',
  red: '#FF4D4F',
  pink: '#FF5FA2',
};

/** A caixa em volta do texto: só o que serve tanto para View quanto para TextInput. */
export interface BoxStyle {
  backgroundColor?: string;
  paddingHorizontal?: number;
  paddingVertical?: number;
  borderRadius?: number;
  overflow?: 'hidden';
}

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: '"Courier New", monospace' });

/** Fontes (como o Instagram): cada uma com seu jeito. Só as fontes do app e as do sistema. */
export const FONT_STYLE: Record<VibeFont, TextStyle> = {
  classic: { fontFamily: fonts.bold },
  modern: { fontFamily: fonts.semibold, letterSpacing: 0.6 },
  strong: { fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 2 },
  serif: { fontFamily: SERIF, fontWeight: 'bold' },
  typewriter: { fontFamily: MONO, fontWeight: 'bold' },
  script: { fontFamily: SERIF, fontStyle: 'italic', fontWeight: 'bold' },
};

/** Preto ou branco, o que ler melhor sobre a cor (para o fundo "cheio" do texto). */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#000000' : '#FFFFFF';
}

/** Tamanho do texto: maior na vibe de texto (é o assunto dela), menor como legenda. */
export function fontSizeFor(kind: VibeKind): number {
  return kind === 'text' ? 26 : 19;
}

/** Giro e tamanho do texto, para o transform (o tamanho base vem do itemStyle). */
export function transformOf(item: Pick<VibeTextItem, 's' | 'r'>) {
  return [{ rotate: `${item.r ?? 0}deg` }, { scale: item.s ?? 1 }];
}

/**
 * Como um texto é desenhado: o estilo do texto e o da caixa em volta.
 * - none: só a letra na cor escolhida, com uma sombra leve para ler sobre foto.
 * - solid: caixa na cor escolhida, letra preto ou branco (o que ler melhor).
 * - soft: caixa translúcida (escura; clara quando a letra é preta), letra na cor escolhida.
 */
export function itemStyle(item: Pick<VibeTextItem, 'f' | 'c' | 'b' | 'a'>, kind: VibeKind): { text: TextStyle; box: BoxStyle } {
  const color = TEXT_COLOR[item.c];
  const size = fontSizeFor(kind);
  const text: { -readonly [K in keyof TextStyle]: TextStyle[K] } = {
    ...FONT_STYLE[item.f],
    fontSize: size,
    lineHeight: Math.round(size * 1.3),
    textAlign: item.a ?? 'center',
  };
  const box: BoxStyle = {};
  if (item.b === 'solid') {
    text.color = readableOn(color);
    box.backgroundColor = color;
  } else if (item.b === 'soft') {
    text.color = color;
    box.backgroundColor = item.c === 'black' ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.5)';
  } else {
    text.color = color;
    text.textShadowColor = item.c === 'black' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    text.textShadowRadius = 6;
  }
  if (item.b !== 'none') Object.assign(box, { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, overflow: 'hidden' });
  return { text, box };
}

/** Estilo de um texto novo, por tipo: legenda com caixa suave sobre mídia, letra solta na vibe de texto. */
export function defaultTextLook(kind: VibeKind): { f: VibeFont; c: VibeTextColor; b: VibeTextBg } {
  return { f: 'classic', c: 'white', b: kind === 'text' ? 'none' : 'soft' };
}

/** Centro padrão do texto de vibes antigas (sem lugar guardado). */
export function legacyPos(kind: VibeKind) {
  return kind === 'text' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.84 };
}

/**
 * Os textos de uma vibe: a lista nova ou, nas vibes antigas, o texto único como um item
 * (com o jeito que elas sempre tiveram: letra solta no texto, caixa escura nas outras).
 */
export function itemsOf(v: {
  kind: VibeKind;
  text: string | null;
  text_x: number | null;
  text_y: number | null;
  text_items: VibeTextItem[] | null;
}): VibeTextItem[] {
  if (v.text_items?.length) return v.text_items;
  if (!v.text) return [];
  const pos = v.text_x != null && v.text_y != null ? { x: v.text_x, y: v.text_y } : legacyPos(v.kind);
  return [{ t: v.text, ...pos, ...defaultTextLook(v.kind) }];
}
