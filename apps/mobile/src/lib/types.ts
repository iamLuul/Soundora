import type { LinkKind, Platform, ReportReason } from '@soundora/core';

// Tipos das tabelas e funções do banco usadas pelo app.
// Para gerar tudo automaticamente: npx supabase gen types typescript --linked > src/lib/database.types.ts

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  locale: 'pt-BR' | 'en';
  created_at: string;
}

export interface LinkPreviewRow {
  id: string;
  url: string;
  platform: Platform;
  kind: LinkKind;
  provider_id: string | null;
  title: string;
  artist: string | null;
  image_url: string | null;
  fetched_at: string;
}

/** Linha devolvida por feed_for_you e profile_posts. */
export interface FeedItem {
  id: string;
  body: string;
  genre: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  liked_by_me: boolean;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  preview_url: string;
  preview_platform: Platform;
  preview_kind: LinkKind;
  preview_title: string;
  preview_artist: string | null;
  preview_image_url: string | null;
  score: number;
}

export interface ProfileSummary {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  followers: number;
  following: number;
  posts: number;
  is_me: boolean;
  i_follow: boolean;
}

export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface AppConfig {
  min_age: number;
  guardian_required_under: number;
  guardian_flow_enabled: boolean;
}

export type { ReportReason };
