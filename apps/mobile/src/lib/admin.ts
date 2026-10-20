import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { previewLink } from './api';
import { supabase } from './supabase';

/**
 * Painel admin. Tudo passa por funções do banco que conferem se quem chama é admin
 * (public.is_admin); o app só esconde a entrada do painel de quem não é, mas quem decide é o
 * banco. Nada aqui usa a chave secreta.
 */

export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ReportTarget = 'post' | 'comment' | 'profile' | 'vibe';

export interface AdminReport {
  target_type: ReportTarget;
  target_id: string;
  report_count: number;
  reasons: string[];
  details: string[];
  latest_at: string;
  status: ReportStatus;
  exists_now: boolean;
  preview: string | null;
  post_id: string | null;
  author_id: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  author_suspended_until: string | null;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  verified: boolean;
  suspended_until: string | null;
  is_admin: boolean;
  created_at: string;
  post_count: number;
  open_reports: number;
  follower_count: number;
}

/** Filtros e ordenação da aba Usuários (os mesmos nomes do banco). */
export type UserFilter = 'all' | 'verified' | 'regular' | 'admin' | 'suspended' | 'reported';
export type UserSort = 'relevance' | 'followers_desc' | 'followers_asc' | 'name_asc' | 'name_desc';

export interface AdminOverview {
  open_reports: number;
  suspended: number;
  verified: number;
  featured_active: number;
}

export interface FeaturedRow {
  id: string;
  note_pt: string | null;
  note_en: string | null;
  position: number;
  starts_at: string;
  ends_at: string | null;
  link_previews: { title: string; artist: string | null; image_url: string | null; url: string; platform: string } | null;
}

/** A conta está suspensa agora? (null/undefined = não.) */
export function isSuspended(until: string | null | undefined, now = Date.now()): boolean {
  if (!until) return false;
  if (until === 'infinity') return true;
  const t = Date.parse(until);
  return Number.isNaN(t) ? false : t > now;
}

export interface AdminBadge {
  id: string;
  slug: string;
  icon: string;
  name_pt: string;
  name_en: string;
  description_pt: string;
  description_en: string;
  award: 'manual' | 'auto';
  grants_open: boolean;
  available_until: string | null;
  /** Dá para entregar agora (aberto e antes da data). */
  grantable: boolean;
  /** A data já passou: encerrado para sempre. */
  retired: boolean;
  holders: number;
}

export interface BadgeHolder {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  granted_at: string;
}

export const adminKeys = {
  isAdmin: ['is-admin'] as const,
  overview: ['admin', 'overview'] as const,
  reports: (status: ReportStatus) => ['admin', 'reports', status] as const,
  users: (q: string, filter: UserFilter, sort: UserSort) => ['admin', 'users', q, filter, sort] as const,
  featured: ['admin', 'featured'] as const,
  badges: ['admin', 'badges'] as const,
  badgeHolders: (badgeId: string) => ['admin', 'badges', badgeId, 'holders'] as const,
};

export function useIsAdmin(enabled = true) {
  return useQuery({
    queryKey: adminKeys.isAdmin,
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin');
      if (error) throw error;
      return data === true;
    },
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_overview');
      if (error) throw error;
      return ((data as AdminOverview[] | null) ?? [])[0] ?? { open_reports: 0, suspended: 0, verified: 0, featured_active: 0 };
    },
  });
}

export function useAdminReports(status: ReportStatus) {
  return useQuery({
    queryKey: adminKeys.reports(status),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_reports', { p_status: status, p_limit: 50, p_offset: 0 });
      if (error) throw error;
      return data as AdminReport[];
    },
  });
}

export function useAdminUsers(query: string, filter: UserFilter = 'all', sort: UserSort = 'relevance') {
  return useQuery({
    queryKey: adminKeys.users(query, filter, sort),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users', { p_query: query, p_filter: filter, p_sort: sort, p_limit: 100 });
      if (error) throw error;
      return data as AdminUser[];
    },
  });
}

export function useFeaturedAdmin() {
  return useQuery({
    queryKey: adminKeys.featured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('featured')
        .select('id, note_pt, note_en, position, starts_at, ends_at, link_previews(title, artist, image_url, url, platform)')
        .order('position')
        .order('starts_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as FeaturedRow[];
    },
  });
}

export function useAdminBadges() {
  return useQuery({
    queryKey: adminKeys.badges,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_badges');
      if (error) throw error;
      return data as AdminBadge[];
    },
  });
}

export function useBadgeHolders(badgeId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.badgeHolders(badgeId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_badge_holders', { p_badge: badgeId, p_limit: 200 });
      if (error) throw error;
      return data as BadgeHolder[];
    },
  });
}

/** As ações do painel; depois de cada uma, atualiza as listas (e as insígnias, se mudou). */
export function useAdminActions() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
  return {
    resolve: useMutation({
      mutationFn: async ({ type, id, action }: { type: ReportTarget; id: string; action: 'dismiss' | 'remove' }) => {
        const { error } = await supabase.rpc('admin_resolve', { p_target_type: type, p_target_id: id, p_action: action });
        if (error) throw error;
      },
      onSuccess: () => {
        done();
        // O conteúdo removido some das listas do app também.
        void qc.invalidateQueries({ queryKey: ['feed'] });
      },
    }),
    verify: useMutation({
      mutationFn: async ({ userId, verified }: { userId: string; verified: boolean }) => {
        const { error } = await supabase.rpc('admin_set_verified', { p_user: userId, p_verified: verified });
        if (error) throw error;
      },
      onSuccess: () => {
        done();
        void qc.invalidateQueries({ queryKey: ['verified-usernames'] });
      },
    }),
    /** days: número de dias, null = sem data para voltar, 0 = reativar. */
    suspend: useMutation({
      mutationFn: async ({ userId, days }: { userId: string; days: number | null }) => {
        const { error } = await supabase.rpc('admin_suspend', { p_user: userId, p_days: days });
        if (error) throw error;
      },
      onSuccess: done,
    }),
    addFeatured: useMutation({
      mutationFn: async ({ url, note, position }: { url: string; note: string; position: number }) => {
        // O cartão da música vem do indexador de links (mesma checagem dos posts).
        const preview = await previewLink(url.trim());
        const { error } = await supabase.from('featured').insert({ link_preview_id: preview.id, note_pt: note.trim() || null, position });
        if (error) throw error;
      },
      onSuccess: done,
    }),
    grantBadge: useMutation({
      mutationFn: async ({ badgeId, username }: { badgeId: string; username: string }) => {
        const { error } = await supabase.rpc('admin_grant_badge', { p_badge: badgeId, p_username: username });
        if (error) throw error;
      },
      onSuccess: () => {
        done();
        void qc.invalidateQueries({ queryKey: ['profile-badges'] });
      },
    }),
    revokeBadge: useMutation({
      mutationFn: async ({ badgeId, userId }: { badgeId: string; userId: string }) => {
        const { error } = await supabase.rpc('admin_revoke_badge', { p_badge: badgeId, p_user: userId });
        if (error) throw error;
      },
      onSuccess: () => {
        done();
        void qc.invalidateQueries({ queryKey: ['profile-badges'] });
      },
    }),
    setBadgeOpen: useMutation({
      mutationFn: async ({ badgeId, open }: { badgeId: string; open: boolean }) => {
        const { error } = await supabase.rpc('admin_set_badge_open', { p_badge: badgeId, p_open: open });
        if (error) throw error;
      },
      onSuccess: () => {
        done();
        void qc.invalidateQueries({ queryKey: ['profile-badges'] });
      },
    }),
    /** until: data ISO (a partir dela ninguém mais recebe; agora = encerrar já) ou null (tirar a data). */
    setBadgeUntil: useMutation({
      mutationFn: async ({ badgeId, until }: { badgeId: string; until: string | null }) => {
        const { error } = await supabase.rpc('admin_set_badge_until', { p_badge: badgeId, p_until: until });
        if (error) throw error;
      },
      onSuccess: () => {
        done();
        void qc.invalidateQueries({ queryKey: ['profile-badges'] });
      },
    }),
    removeFeatured: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('featured').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
  };
}
