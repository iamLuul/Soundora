// Notificações: lista, não lidas, tipos silenciados e push.
import { supabase } from '../supabase';

/** Tipos de notificação desligados. */
export async function fetchMutedNotificationKinds(): Promise<NotificationKind[]> {
  const { data, error } = await supabase.from('notification_settings').select('muted_kinds').maybeSingle();
  if (error) throw error;
  return (data?.muted_kinds ?? []) as NotificationKind[];
}

export async function setMutedNotificationKinds(kinds: NotificationKind[]): Promise<void> {
  const { error } = await supabase.rpc('set_notification_settings', { p_muted_kinds: kinds });
  if (error) throw error;
}

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'comment_reply'
  | 'comment_like'
  | 'review_like'
  | 'follow_request'
  | 'follow_accepted'
  /** Só nas configurações: desliga o push de mensagem (as mensagens continuam chegando). */
  | 'message';

export type NotificationFilter = 'all' | 'replies';

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  created_at: string;
  read: boolean;
  actor_id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  post_id: string | null;
  preview_title: string | null;
  preview_image_url: string | null;
  comment_body: string | null;
  /** Curtida em review: o álbum (abre a tela do álbum). */
  review_album_id?: string | null;
}

export async function fetchNotifications(filter: NotificationFilter, before: number | null): Promise<NotificationItem[]> {
  const { data, error } = await supabase.rpc('notifications_list', { p_filter: filter, p_before: before, p_limit: 30 });
  if (error) throw error;
  return (data ?? []) as NotificationItem[];
}

export async function fetchUnreadNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc('notifications_unread_count');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('notifications_mark_read');
  if (error) throw error;
}

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  const { error } = await supabase.rpc('push_token_register', { p_token: token, p_platform: platform });
  if (error) throw error;
}

export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('push_token_unregister', { p_token: token });
  if (error) throw error;
}
