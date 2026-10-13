// Acessibilidade (Configurações › Acessibilidade): tamanho do texto, dos ícones e menos
// movimento. Fica guardado neste aparelho e vale desde a abertura do app (display-install.ts
// aplica a escala nos estilos e ícones antes de qualquer tela carregar).
import { deviceGet, deviceSet } from './device-storage';

export type TextSize = 'small' | 'default' | 'large' | 'xlarge';
export type IconSize = 'default' | 'large' | 'xlarge';

export interface DisplayPrefs {
  text: TextSize;
  icons: IconSize;
  reduceMotion: boolean;
}

export const TEXT_SIZES: Record<TextSize, number> = { small: 0.9, default: 1, large: 1.15, xlarge: 1.3 };
export const ICON_SIZES: Record<IconSize, number> = { default: 1, large: 1.2, xlarge: 1.4 };
export const DEFAULT_DISPLAY: DisplayPrefs = { text: 'default', icons: 'default', reduceMotion: false };

const KEY = 'soundora.display';

/** Lê as preferências guardadas (valores estranhos voltam ao padrão). */
export function parseDisplayPrefs(raw: string | null): DisplayPrefs {
  try {
    const v = JSON.parse(raw ?? '{}') as Partial<DisplayPrefs>;
    return {
      text: v.text && v.text in TEXT_SIZES ? v.text : 'default',
      icons: v.icons && v.icons in ICON_SIZES ? v.icons : 'default',
      reduceMotion: v.reduceMotion === true,
    };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

export function readDisplayPrefs(): DisplayPrefs {
  return parseDisplayPrefs(deviceGet(KEY));
}

export function saveDisplayPrefs(prefs: DisplayPrefs) {
  deviceSet(KEY, JSON.stringify(prefs));
}

/** O que vale nesta abertura do app (mudar só vale depois de recarregar). */
const loaded = readDisplayPrefs();
export const fontScale = TEXT_SIZES[loaded.text];
export const iconScale = ICON_SIZES[loaded.icons];
export const display = { ...loaded, fontScale, iconScale };

/** Multiplica tamanhos de fonte (fontSize e lineHeight) de um conjunto de estilos. */
export function scaleStyles<T extends Record<string, unknown>>(styles: T, scale: number): T {
  if (scale === 1) return styles;
  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(styles)) {
    if (style && typeof style === 'object' && !Array.isArray(style)) {
      const s = { ...(style as Record<string, unknown>) };
      for (const prop of ['fontSize', 'lineHeight'] as const) {
        if (typeof s[prop] === 'number') s[prop] = Math.round((s[prop] as number) * scale * 10) / 10;
      }
      out[name] = s;
    } else out[name] = style;
  }
  return out as T;
}
