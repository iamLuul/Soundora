// Música: Descobrir, curtidas, Em alta, links de streaming e busca de faixas e gêneros.
import { type StreamingChoice } from '@soundhora/core';
import { AppError } from '../errors';
import { supabase } from '../supabase';
import type { DiscoverCard, LinkPreviewRow, LikedSong, TrackResult } from '../types';
import { currentUserId, functionError, invokeFunction } from './client';

/** Músicas que a pessoa curtiu no Descobrir (perfil › Curtidas), em páginas. */
export const LIKED_SONGS_PAGE = 30;

export async function fetchProfileLikedSongs(userId: string, before: { liked_at: string; link_preview_id: string } | null): Promise<LikedSong[]> {
  const { data, error } = await supabase.rpc('profile_liked_songs', {
    p_user: userId,
    p_before: before?.liked_at ?? null,
    p_before_id: before?.link_preview_id ?? null,
    p_limit: LIKED_SONGS_PAGE,
  });
  if (error) throw error;
  return (data ?? []) as LikedSong[];
}

export async function fetchDiscoverCards(limit = 20): Promise<DiscoverCard[]> {
  const { data, error } = await supabase.rpc('discover_cards', { p_limit: limit });
  if (error) throw error;
  return data as DiscoverCard[];
}

/** Registra o swipe. Para a direita também curte o post de origem. */
export async function swipeDiscover(card: Pick<DiscoverCard, 'link_preview_id' | 'post_id'>, liked: boolean): Promise<void> {
  const { error } = await supabase.rpc('discover_swipe', {
    p_link_preview_id: card.link_preview_id,
    p_liked: liked,
    p_post_id: card.post_id,
  });
  if (error) throw error;
}

/** Uma música do ranking mundial (Edge Function music-charts). */
export interface ChartTrack {
  position: number;
  key: string;
  title: string;
  artist: string;
  album: string | null;
  image_url: string | null;
  /** Subiu, caiu, manteve, entrou agora, ou null (sem ranking anterior para comparar). */
  move: 'up' | 'down' | 'same' | 'new' | null;
  previous_position: number | null;
}

/** Sugestões do algoritmo para o Descobrir (ou só de um gênero). */
export async function fetchRecommendations(genre: string | null): Promise<DiscoverCard[]> {
  const { data, error } = await invokeFunction<{
    cards: Omit<DiscoverCard, 'kind' | 'source' | 'note' | 'post_id' | 'recommender_username' | 'recommender_display_name' | 'recommender_avatar_url'>[];
  }>('discover', { body: { action: 'deck', ...(genre ? { genre } : {}) } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  return (data?.cards ?? []).map((c) => ({
    ...c,
    kind: 'track',
    source: 'for_you',
    note: null,
    post_id: null,
    recommender_username: null,
    recommender_display_name: null,
    recommender_avatar_url: null,
  }));
}

/** Músicas que curti no Descobrir. */
export async function fetchLikedSongs(): Promise<LikedSong[]> {
  const { data, error } = await supabase.rpc('discover_liked', { p_limit: 100 });
  if (error) throw error;
  return data as LikedSong[];
}

/** Prévia renovada de um cartão do Descobrir (a da Deezer vence pelo próprio link). */
export async function refreshDiscoverAudio(previewId: string): Promise<string | null> {
  const { data, error } = await invokeFunction<{ audio_url: string | null }>('discover', { body: { action: 'audio', previewId } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  const url = data?.audio_url ?? null;
  // Só https (em desenvolvimento, aceita http para servidores locais de teste).
  return url && (url.startsWith('https://') || (__DEV__ && url.startsWith('http://'))) ? url : null;
}

/** Link de uma música (cartão) na plataforma escolhida: exato, ou a busca nela. */
export async function trackLink(previewId: string, platform: StreamingChoice): Promise<string> {
  const { data, error } = await invokeFunction<{ url: string }>('discover', { body: { action: 'link', previewId, platform } });
  if (error) throw await functionError('discover', error, 'discover_unavailable');
  if (!data?.url || !data.url.startsWith('https://')) throw new AppError('generic');
  return data.url;
}

/** Período do ranking mundial: sempre os últimos 7, 30 ou 360 dias. */
export type ChartPeriod = 'week' | 'month' | 'year';

export const CHART_PERIOD_DAYS: Record<ChartPeriod, number> = { week: 7, month: 30, year: 360 };

export interface WorldChart {
  period: ChartPeriod;
  /** Em quantos dias do período houve foto do ranking (no começo, menos que o período). */
  days: number;
  updated_at: string;
  stale: boolean;
  entries: ChartTrack[];
}

/** As mais ouvidas no mundo (Last.fm) na semana, no mês ou no ano, pelo servidor. */
export async function fetchWorldChart(period: ChartPeriod = 'week'): Promise<WorldChart> {
  const { data, error } = await invokeFunction('music-charts', { body: { action: 'chart', period } });
  if (error) throw await functionError('music-charts', error, 'charts_unavailable');
  const chart = data as WorldChart;
  return { ...chart, period: chart.period ?? period, days: chart.days ?? CHART_PERIOD_DAYS[period] };
}

/** Link da música do ranking na plataforma escolhida (exato, ou a busca dela na plataforma). */
export async function chartTrackLink(key: string, platform: StreamingChoice): Promise<string> {
  const { data, error } = await invokeFunction<{ url: string }>('music-charts', { body: { action: 'link', key, platform } });
  if (error) throw await functionError('music-charts', error, 'charts_unavailable');
  if (!data?.url || !data.url.startsWith('https://')) throw new AppError('generic');
  return data.url;
}

export async function searchTracks(query: string): Promise<TrackResult[]> {
  const { data, error } = await supabase.rpc('search_tracks', { p_query: query, p_limit: 20 });
  if (error) throw error;
  return data as TrackResult[];
}

/** Gêneros que batem com o texto, com quantos posts têm cada um (os com posts primeiro). */
export interface GenreHit {
  slug: string;
  name_pt: string;
  name_en: string;
  post_count: number;
}

export async function searchPostGenres(query: string): Promise<GenreHit[]> {
  const { data, error } = await supabase.rpc('search_post_genres', { p_query: query.toLowerCase(), p_limit: 8 });
  if (error) throw error;
  return data as GenreHit[];
}

/** Uma música (cartão de prévia) numa lista simples. */
export interface TrackItem {
  link_preview_id: string;
  url: string;
  platform: LinkPreviewRow['platform'];
  title: string;
  artist: string | null;
  image_url: string | null;
}

const TRACK_COLUMNS = 'id, url, platform, title, artist, image_url';

type PreviewJoin = { id: string; url: string; platform: LinkPreviewRow['platform']; title: string; artist: string | null; image_url: string | null };

const toTrack = (p: PreviewJoin): TrackItem => ({
  link_preview_id: p.id,
  url: p.url,
  platform: p.platform,
  title: p.title,
  artist: p.artist,
  image_url: p.image_url,
});

/** Músicas que a pessoa curtiu no Descobrir (mais recentes primeiro). */
export async function fetchLikedTracks(): Promise<TrackItem[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('discover_swipes')
    .select(`created_at, link_previews(${TRACK_COLUMNS})`)
    .eq('user_id', userId)
    .eq('liked', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as unknown as { link_previews: PreviewJoin | null }[]).flatMap((r) => (r.link_previews ? [toTrack(r.link_previews)] : []));
}

/** Músicas que a pessoa postou (sem repetir a mesma música). */
export async function fetchMyTracks(): Promise<TrackItem[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('posts')
    .select(`created_at, link_previews(${TRACK_COLUMNS})`)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const seen = new Set<string>();
  return (data as unknown as { link_previews: PreviewJoin | null }[]).flatMap((r) => {
    if (!r.link_previews || seen.has(r.link_previews.id)) return [];
    seen.add(r.link_previews.id);
    return [toTrack(r.link_previews)];
  });
}
