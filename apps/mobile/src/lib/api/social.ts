// Pessoas: seguir, pedidos, sugestões, listas de seguidores, bloquear, silenciar e denunciar.
import { type ReportReason } from '@soundhora/core';
import { supabase } from '../supabase';
import type { PersonCard } from '../types';
import { currentUserId } from './client';

export interface PersonRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  i_follow: boolean;
  is_me: boolean;
}

export const PEOPLE_PAGE = 30;

export async function fetchPeople(username: string, list: 'followers' | 'following', page: number): Promise<PersonRow[]> {
  const { data, error } = await supabase.rpc('profile_people', { p_username: username, p_list: list, p_limit: PEOPLE_PAGE, p_offset: page * PEOPLE_PAGE });
  if (error) throw error;
  return (data ?? []) as PersonRow[];
}

/** Por que a conta foi sugerida: gêneros parecidos, posts que curti ou seguida por quem sigo. */
export type SuggestionReason = 'genres' | 'liked' | 'friends' | 'community';

export interface SuggestedAccount {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  /** Até 2 gêneros em comum com o meu gosto (slugs). */
  genres: string[];
  reason: SuggestionReason;
}

export async function fetchSuggestedAccounts(limit = 12): Promise<SuggestedAccount[]> {
  const { data, error } = await supabase.rpc('suggested_accounts', { p_limit: limit });
  if (error) throw error;
  return data as SuggestedAccount[];
}

/** Ids de quem eu sigo (para o botão Seguir dos posts). */
export async function fetchMyFollowingIds(): Promise<string[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', userId).limit(5000);
  if (error) throw error;
  return (data as { followee_id: string }[]).map((r) => r.followee_id);
}

/** Resultado de seguir: segue na hora (conta pública), pediu (privada) ou não segue mais. */
export type FollowStatus = 'following' | 'requested' | 'none';

/**
 * Seguir: conta pública segue na hora; conta privada vira pedido. Deixar de seguir também
 * desiste de um pedido pendente.
 */
export async function setFollowing(followeeId: string, follow: boolean): Promise<FollowStatus> {
  if (follow) {
    const { data, error } = await supabase.rpc('request_follow', { p_target: followeeId });
    if (error) throw error;
    return data === 'requested' ? 'requested' : 'following';
  }
  const userId = await currentUserId();
  const [unfollow, cancel] = await Promise.all([
    supabase.from('follows').delete().eq('follower_id', userId).eq('followee_id', followeeId),
    supabase.rpc('cancel_follow_request', { p_target: followeeId }),
  ]);
  if (unfollow.error) throw unfollow.error;
  if (cancel.error) throw cancel.error;
  return 'none';
}

/** Contas privadas para as quais eu pedi para seguir (ainda sem resposta). */
export async function fetchRequestedIds(): Promise<Set<string>> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('follow_requests').select('target_id').eq('requester_id', userId).limit(5000);
  if (error) throw error;
  return new Set(data.map((r) => r.target_id as string));
}

export interface FollowRequest {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  requested_at: string;
}

/** Pedidos para seguir que eu recebi (conta privada). */
export async function fetchFollowRequests(): Promise<FollowRequest[]> {
  const { data, error } = await supabase.rpc('my_follow_requests', { p_limit: 100 });
  if (error) throw error;
  return data as FollowRequest[];
}

export async function respondFollowRequest(requesterId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_follow_request', { p_requester: requesterId, p_accept: accept });
  if (error) throw error;
}

export async function blockUser(blockedId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(blockedId: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId);
  if (error) throw error;
}

/** Silenciar: as publicações da pessoa somem dos meus feeds e ela não me notifica (sem saber). */
export async function setUserMuted(userId: string, muted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_user_muted', { p_user: userId, p_muted: muted });
  if (error) throw error;
}

/** Eu silenciei esta pessoa? (só a minha lista é visível) */
export async function isUserMuted(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('muted_users').select('muted_id').eq('muted_id', userId).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function fetchMutedProfiles(): Promise<PersonCard[]> {
  const { data, error } = await supabase.rpc('my_muted_profiles');
  if (error) throw error;
  return data as PersonCard[];
}

export async function report(targetType: 'post' | 'comment' | 'profile' | 'vibe' | 'review', targetId: string, reason: ReportReason): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: targetType, target_id: targetId, reason });
  if (error && error.code !== '23505') throw error;
}

export async function searchProfiles(query: string): Promise<PersonCard[]> {
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return data as PersonCard[];
}

/** Quem eu bloqueei (o mais recente primeiro). */
export async function fetchBlockedProfiles(): Promise<PersonCard[]> {
  const { data, error } = await supabase.rpc('my_blocked_profiles');
  if (error) throw error;
  return data as PersonCard[];
}
