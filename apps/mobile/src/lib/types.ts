import type { LinkKind, Platform, ReportReason } from '@soundora/core';

// Tipos das tabelas e funções do banco usadas pelo app.
// Para gerar tudo automaticamente: npx supabase gen types typescript --linked > src/lib/database.types.ts

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  locale: 'pt-BR' | 'en';
  username_changed_at: string | null;
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
  /** Gêneros detectados nas lojas (null = ainda não procurou). */
  genres: string[] | null;
  /** Prévia de 30 s oficial da Apple/Deezer (null = a loja não oferece). */
  audio_url?: string | null;
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
  /** Cartão da música (null em post só de texto ou mídia). */
  preview_url: string | null;
  preview_platform: Platform | null;
  preview_kind: LinkKind | null;
  preview_title: string | null;
  preview_artist: string | null;
  preview_image_url: string | null;
  score: number;
  /** Até 3 gêneros (slugs de public.genres). */
  genres: string[];
  /** Fotos (até 4) ou um vídeo, na ordem. Caminhos no bucket privado "post-media". */
  media: PostMedia[];
  post_type: 'music' | 'text' | 'media';
}

export interface PostMedia {
  path: string;
  kind: 'photo' | 'video';
  width: number;
  height: number;
  duration_ms: number | null;
}

export interface ProfileSummary {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  followers: number;
  following: number;
  posts: number;
  /** Curtidas recebidas em todos os posts. */
  likes: number;
  is_me: boolean;
  i_follow: boolean;
}

/** Linha de post_comments: principais na ordem, cada um seguido das suas respostas. */
export interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  liked_by_me: boolean;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
}

export interface AppConfig {
  min_age: number;
  guardian_required_under: number;
  guardian_flow_enabled: boolean;
}

export type { ReportReason };

/** Cartão do Descobrir (função discover_cards). */
export interface DiscoverCard {
  link_preview_id: string;
  url: string;
  platform: Platform;
  kind: LinkKind;
  title: string;
  artist: string | null;
  image_url: string | null;
  genre: string | null;
  source: 'featured' | 'community';
  note: string | null;
  post_id: string | null;
  recommender_username: string | null;
  recommender_display_name: string | null;
  recommender_avatar_url: string | null;
}

/** Linha do Em alta (função trending_tracks). */
export interface TrendingTrack {
  rank: number;
  link_preview_id: string;
  url: string;
  platform: Platform;
  kind: LinkKind;
  title: string;
  artist: string | null;
  image_url: string | null;
  post_count: number;
  like_count: number;
  score: number;
}

/** Resultado de música na busca (função search_tracks). */
export interface TrackResult {
  link_preview_id: string;
  url: string;
  platform: Platform;
  kind: LinkKind;
  title: string;
  artist: string | null;
  image_url: string | null;
  post_count: number;
}
