// Vibes (como os Stories: somem em 24 h).
import { supabase } from '../supabase';
import { uploadMedia } from './media';

export type VibeKind = 'photo' | 'video' | 'text' | 'post';

export const VIBE_STYLES = ['violet', 'blue', 'pink', 'green', 'orange', 'dark'] as const;

export type VibeStyle = (typeof VIBE_STYLES)[number];

/** Fontes, cores e fundos dos textos da vibe (nomes de uma lista fechada, a mesma do servidor). */
export const VIBE_FONTS = ['classic', 'modern', 'strong', 'serif', 'typewriter', 'script'] as const;

export type VibeFont = (typeof VIBE_FONTS)[number];

export const VIBE_TEXT_COLORS = ['white', 'black', 'violet', 'blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink'] as const;

export type VibeTextColor = (typeof VIBE_TEXT_COLORS)[number];

export const VIBE_TEXT_BGS = ['none', 'solid', 'soft'] as const;

export type VibeTextBg = (typeof VIBE_TEXT_BGS)[number];

/** Máximo de textos por vibe e de caracteres por texto (iguais aos do servidor). */
export const VIBE_MAX_TEXTS = 8;

export const VIBE_TEXT_MAX = 300;

export const VIBE_TEXT_ALIGNS = ['center', 'left', 'right'] as const;

export type VibeTextAlign = (typeof VIBE_TEXT_ALIGNS)[number];

/** Tamanho do texto (multiplicador), dentro do que o servidor aceita (0,3 a 4). */
export const VIBE_TEXT_SCALE = { min: 0.5, max: 3 } as const;

/**
 * Um texto da vibe: onde fica (centro, em fração da tela) e como é desenhado. Tamanho (s), giro
 * em graus (r) e alinhamento (a) são opcionais: textos antigos não têm.
 */
export interface VibeTextItem {
  t: string;
  x: number;
  y: number;
  f: VibeFont;
  c: VibeTextColor;
  b: VibeTextBg;
  s?: number;
  r?: number;
  a?: VibeTextAlign;
}

/** Limites do vídeo (vibes e posts), iguais aos da Edge Function media-upload. */
export const VIBE_VIDEO_MAX = { seconds: 30, bytes: 30 * 1024 * 1024 };

export interface VibeTrayItem {
  author_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  vibe_count: number;
  unseen: boolean;
  latest_at: string;
  is_me: boolean;
}

export interface Vibe {
  id: string;
  kind: VibeKind;
  media_path: string | null;
  duration_ms: number | null;
  text: string | null;
  style: VibeStyle;
  created_at: string;
  seen: boolean;
  /** Só para o autor. */
  view_count: number | null;
  preview_url: string | null;
  preview_platform: string | null;
  preview_title: string | null;
  preview_artist: string | null;
  preview_image_url: string | null;
  post_id: string | null;
  post_body: string | null;
  post_author_username: string | null;
  post_author_avatar_url: string | null;
  text_x: number | null;
  text_y: number | null;
  preview_audio_url: string | null;
  /** Vários textos (vibes novas). null = vibe antiga, com um texto só (text, text_x, text_y). */
  text_items: VibeTextItem[] | null;
}

export interface VibeViewer {
  username: string;
  display_name: string;
  avatar_url: string | null;
  viewed_at: string;
}

export async function fetchVibesTray(): Promise<VibeTrayItem[]> {
  const { data, error } = await supabase.rpc('vibes_tray');
  if (error) throw error;
  return (data ?? []) as VibeTrayItem[];
}

/** Dos autores pedidos (até 200), os que têm vibe ativa que eu posso ver (anel roxo da foto). */
export async function fetchAuthorsWithVibes(authorIds: string[]): Promise<Set<string>> {
  if (!authorIds.length) return new Set();
  const { data, error } = await supabase.rpc('authors_with_vibes', { p_ids: authorIds.slice(0, 200) });
  if (error) throw error;
  return new Set((data ?? []) as string[]);
}

export async function fetchVibesOf(authorId: string): Promise<Vibe[]> {
  const { data, error } = await supabase.rpc('vibes_of', { p_author: authorId });
  if (error) throw error;
  return (data ?? []) as Vibe[];
}

export async function markVibeSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('vibe_mark_seen', { p_vibe: id });
  if (error) throw error;
}

export async function fetchVibeViewers(id: string): Promise<VibeViewer[]> {
  const { data, error } = await supabase.rpc('vibe_viewers', { p_vibe: id });
  if (error) throw error;
  return (data ?? []) as VibeViewer[];
}

export async function deleteVibe(id: string): Promise<void> {
  const { error } = await supabase.rpc('vibe_delete', { p_vibe: id });
  if (error) throw error;
}

/** URL temporária (1 h) da foto/vídeo: o bucket é privado e só libera vibe ativa e sem bloqueio. */
export async function vibeMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('vibes').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export const uploadVibeMedia = (type: 'photo' | 'video', bytes: Uint8Array) => uploadMedia('vibe', type, bytes);

export interface NewVibe {
  kind: VibeKind;
  mediaPath?: string;
  durationMs?: number;
  style?: VibeStyle;
  postId?: string;
  /** Os textos escritos na vibe (até 8, cada um com lugar, fonte, cor e fundo). */
  textItems?: VibeTextItem[];
}

export async function createVibe(v: NewVibe): Promise<string> {
  // Tamanho e giro arredondados (o servidor confere os limites); padrão (1, 0, centro) não vai.
  const items = (v.textItems ?? [])
    .map(({ s, r, a, ...rest }) => ({
      ...rest,
      t: rest.t.trim(),
      ...(s !== undefined && Math.abs(s - 1) > 0.01 ? { s: Math.round(Math.min(VIBE_TEXT_SCALE.max, Math.max(VIBE_TEXT_SCALE.min, s)) * 100) / 100 } : {}),
      ...(r !== undefined && Math.abs(r) > 0.5 ? { r: Math.round(((((r + 180) % 360) + 360) % 360) - 180) } : {}),
      ...(a && a !== 'center' ? { a } : {}),
    }))
    .filter((i) => i.t);
  const { data, error } = await supabase.rpc('vibe_create', {
    p_kind: v.kind,
    p_media_path: v.mediaPath ?? null,
    p_duration_ms: v.durationMs ?? null,
    p_style: v.style ?? 'violet',
    p_post_id: v.postId ?? null,
    p_text_items: items.length ? items : null,
  });
  if (error) throw error;
  return data as string;
}
