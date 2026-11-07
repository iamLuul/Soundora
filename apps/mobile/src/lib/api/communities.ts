// Comunidades.
import { AppError } from '../errors';
import { convertProfileImage } from '../image-convert';
import { imageContentType } from '../image-plan';
import { supabase } from '../supabase';
import type { FeedItem } from '../types';
import { functionError, invokeFunction } from './client';
import { FEED_PAGE_SIZE, PostCursor } from './posts';

export const COMMUNITY_COLORS = 6;

export const COMMUNITY_MAX_ARTISTS = 10;

export const COMMUNITY_MAX_GENRES = 5;

export type CommunityVisibility = 'open' | 'closed';

export type CommunityRole = 'owner' | 'moderator' | 'member';

export type CommunityMemberStatus = 'active' | 'pending' | 'banned';

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: CommunityVisibility;
  color: number;
  /** Caminho da foto no Storage (null = inicial sobre a cor). */
  avatar_url: string | null;
  artists: string[];
  genres: string[];
  member_count: number;
  created_at: string;
  my_role: CommunityRole | null;
  my_status: CommunityMemberStatus | null;
  /** Posso ver os posts (aberta, ou sou membro da fechada). */
  can_view: boolean;
  /** Pedidos esperando (só para moderadores). */
  pending_count: number | null;
}

export interface CommunityCard {
  id: string;
  slug: string;
  name: string;
  description?: string;
  visibility: CommunityVisibility;
  color: number;
  avatar_url?: string | null;
  member_count: number;
  joined?: boolean;
  genres?: string[];
  reason?: 'artists' | 'genres' | 'members' | 'popular';
  role?: CommunityRole;
}

export interface CommunityMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: CommunityRole;
  status: CommunityMemberStatus;
  since: string;
}

export interface CommunityInput {
  slug?: string;
  name: string;
  description: string;
  visibility: CommunityVisibility;
  genres: string[];
  artists: string[];
  color: number;
}

/** @ da comunidade: letras minúsculas, números e _ (3 a 30). */
export const COMMUNITY_SLUG = /^[a-z0-9_]{3,30}$/;

export async function createCommunity(c: CommunityInput & { slug: string }): Promise<string> {
  const { data, error } = await supabase.rpc('community_create', {
    p_slug: c.slug.trim().toLowerCase(),
    p_name: c.name.trim(),
    p_description: c.description.trim(),
    p_visibility: c.visibility,
    p_genres: c.genres,
    p_artists: c.artists,
    p_color: c.color,
  });
  if (error) throw error;
  return data as string;
}

export async function updateCommunity(id: string, c: CommunityInput): Promise<void> {
  const { error } = await supabase.rpc('community_update', {
    p_community: id,
    p_name: c.name.trim(),
    p_description: c.description.trim(),
    p_visibility: c.visibility,
    p_genres: c.genres,
    p_artists: c.artists,
    p_color: c.color,
  });
  if (error) throw error;
}

/** Troca a foto da comunidade (só a dona): mesma conversão e conferência da foto do perfil. */
export async function uploadCommunityImage(communityId: string, image: { uri: string; width: number; height: number }): Promise<string> {
  const bytes = await convertProfileImage('avatar', image.uri, image.width, image.height);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const { data, error } = await invokeFunction<{ path: string }>(`profile-image?kind=community&community=${encodeURIComponent(communityId)}`, {
    body,
    headers: { 'Content-Type': imageContentType(bytes) },
  });
  if (error) throw await functionError('profile-image', error, 'generic');
  if (!data?.path) throw new AppError('generic');
  return data.path;
}

export async function removeCommunityImage(communityId: string): Promise<void> {
  const { error } = await invokeFunction(`profile-image?kind=community&community=${encodeURIComponent(communityId)}`, { method: 'DELETE' });
  if (error) throw await functionError('profile-image', error, 'generic');
}

export async function deleteCommunity(id: string): Promise<void> {
  const { error } = await supabase.rpc('community_delete', { p_community: id });
  if (error) throw error;
}

export async function fetchCommunity(slug: string): Promise<Community | null> {
  const { data, error } = await supabase.rpc('community_get', { p_slug: slug });
  if (error) throw error;
  return ((data ?? []) as Community[])[0] ?? null;
}

export async function fetchMyCommunities(): Promise<CommunityCard[]> {
  const { data, error } = await supabase.rpc('my_communities');
  if (error) throw error;
  return (data ?? []) as CommunityCard[];
}

export async function joinCommunity(id: string): Promise<CommunityMemberStatus> {
  const { data, error } = await supabase.rpc('community_join', { p_community: id });
  if (error) throw error;
  return data as CommunityMemberStatus;
}

export async function leaveCommunity(id: string): Promise<void> {
  const { error } = await supabase.rpc('community_leave', { p_community: id });
  if (error) throw error;
}

export async function fetchCommunityMembers(id: string, status: CommunityMemberStatus = 'active', offset = 0): Promise<CommunityMember[]> {
  const { data, error } = await supabase.rpc('community_members_list', { p_community: id, p_status: status, p_limit: 50, p_offset: offset });
  if (error) throw error;
  return (data ?? []) as CommunityMember[];
}

export async function respondCommunityRequest(id: string, userId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('community_respond', { p_community: id, p_user: userId, p_accept: accept });
  if (error) throw error;
}

export async function banFromCommunity(id: string, userId: string, banned: boolean): Promise<void> {
  const { error } = await supabase.rpc('community_ban', { p_community: id, p_user: userId, p_banned: banned });
  if (error) throw error;
}

export async function setCommunityRole(id: string, userId: string, role: CommunityRole): Promise<void> {
  const { error } = await supabase.rpc('community_set_role', { p_community: id, p_user: userId, p_role: role });
  if (error) throw error;
}

export async function removeCommunityPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc('community_remove_post', { p_post: postId });
  if (error) throw error;
}

/** Posts de uma comunidade (ou de todas as minhas, com id null), do mais novo ao mais velho. */
export async function fetchCommunityPosts(id: string | null, before: PostCursor | null): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('community_posts', {
    p_community: id,
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []) as FeedItem[];
}

export async function searchCommunities(query: string): Promise<CommunityCard[]> {
  const { data, error } = await supabase.rpc('communities_search', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return (data ?? []) as CommunityCard[];
}

export async function fetchRecommendedCommunities(limit = 8): Promise<CommunityCard[]> {
  const { data, error } = await supabase.rpc('communities_recommended', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as CommunityCard[];
}

/** O @ da comunidade está livre? (único entre pessoas e comunidades) */
export async function communitySlugAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('community_slug_available', { p_slug: slug });
  if (error) throw error;
  return data === true;
}
