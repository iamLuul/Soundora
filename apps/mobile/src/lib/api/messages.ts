// Mensagens diretas.
import { AppError } from '../errors';
import { supabase } from '../supabase';
import { VibeKind, VibeStyle } from './vibes';

/** Tamanho máximo de uma mensagem (o banco confere de novo). */
export const DM_MAX = 1000;

/** Uma conversa na lista (Mensagens ou Pedidos). */
export interface DmThread {
  conversation_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_body: string | null;
  last_from_me: boolean;
  last_vibe_reply: boolean;
  last_unsent: boolean;
  last_at: string;
  unread: boolean;
}

/** Cabeçalho de uma conversa. */
export interface DmConversation {
  conversation_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  /** false: a conversa está nos meus Pedidos. */
  accepted: boolean;
  /** Até onde a outra pessoa leu ("Visto"). */
  their_last_read_at: string | null;
  can_send: boolean;
}

export interface DmMessage {
  id: number;
  from_me: boolean;
  body: string | null;
  liked: boolean;
  unsent: boolean;
  created_at: string;
  vibe_reply: boolean;
  /** A vibe respondida, enquanto ela está no ar. */
  vibe_id: string | null;
  vibe_kind: VibeKind | null;
  vibe_media_path: string | null;
  vibe_text: string | null;
  vibe_style: VibeStyle | null;
  vibe_mine: boolean | null;
}

export const DM_PAGE = 40;

export async function fetchDmInbox(requests: boolean, before: string | null): Promise<DmThread[]> {
  const { data, error } = await supabase.rpc('dm_inbox', { p_requests: requests, p_before: before, p_limit: 30 });
  if (error) throw error;
  return (data ?? []) as DmThread[];
}

export async function fetchDmUnread(): Promise<{ unread: number; requests: number }> {
  const { data, error } = await supabase.rpc('dm_unread_count');
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { unread?: number; requests?: number } | undefined;
  return { unread: row?.unread ?? 0, requests: row?.requests ?? 0 };
}

export async function findDm(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('dm_find', { p_user: userId });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

export async function fetchDmConversation(id: string): Promise<DmConversation | null> {
  const { data, error } = await supabase.rpc('dm_conversation', { p_conversation: id });
  if (error) throw error;
  return ((data ?? []) as DmConversation[])[0] ?? null;
}

export async function fetchDmMessages(id: string, before: number | null): Promise<DmMessage[]> {
  const { data, error } = await supabase.rpc('dm_messages', { p_conversation: id, p_before: before, p_limit: DM_PAGE });
  if (error) throw error;
  return (data ?? []) as DmMessage[];
}

/** Manda uma mensagem para alguém (to) ou numa conversa. vibeId: responder a vibe de quem recebe. */
export async function sendDm(
  body: string,
  target: { to?: string; conversation?: string },
  vibeId?: string,
): Promise<{ conversation_id: string; message_id: number }> {
  const text = body.trim();
  if (!text) throw new AppError('invalid_request');
  if (text.length > DM_MAX) throw new AppError('invalid_request');
  const { data, error } = await supabase.rpc('dm_send', {
    p_body: text,
    p_to: target.to ?? null,
    p_conversation: target.conversation ?? null,
    p_vibe: vibeId ?? null,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { conversation_id: string; message_id: number };
  return row;
}

export async function markDmRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('dm_mark_read', { p_conversation: id });
  if (error) throw error;
}

export async function acceptDm(id: string): Promise<void> {
  const { error } = await supabase.rpc('dm_accept', { p_conversation: id });
  if (error) throw error;
}

export async function deleteDm(id: string): Promise<void> {
  const { error } = await supabase.rpc('dm_delete', { p_conversation: id });
  if (error) throw error;
}

export async function likeDm(messageId: number, liked: boolean): Promise<void> {
  const { error } = await supabase.rpc('dm_like', { p_message: messageId, p_liked: liked });
  if (error) throw error;
}

export async function unsendDm(messageId: number): Promise<void> {
  const { error } = await supabase.rpc('dm_unsend', { p_message: messageId });
  if (error) throw error;
}
