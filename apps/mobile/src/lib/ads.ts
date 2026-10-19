import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { fetchMyAccount } from './api';
import { initAds } from './ads-sdk';
import { useAuth } from './auth';
import { supabase } from './supabase';

/**
 * Anúncios do Soundhora (AdMob): "posts anunciados" no feed da Início e "vibes anunciadas" na
 * fila de vibes, sempre com o selo "Patrocinado".
 *
 * - Só no celular: na web não há anúncios (o AdMob é só para apps).
 * - Desligados até a equipe ligar no banco (`app_config.ads_enabled`), sem publicar o app de novo.
 * - Nunca personalizados (no MVP, para ninguém): o anúncio não usa o perfil, os gostos nem o
 *   histórico da pessoa. Para menores de 18 isso é exigido pelo ECA Digital (arts. 22 e 26).
 * - O app não manda nada da pessoa para a rede de anúncios (nem @, nem e-mail, nem conteúdo).
 */
export const canShowAds = Platform.OS !== 'web';

export interface AdsConfig {
  enabled: boolean;
  /** Um anúncio depois de cada N posts do feed. */
  feedEvery: number;
  /** Uma vibe anunciada depois de cada N pessoas na fila de vibes. */
  vibesEvery: number;
}

export const ADS_OFF: AdsConfig = { enabled: false, feedEvery: 0, vibesEvery: 0 };

export async function fetchAdsConfig(): Promise<AdsConfig> {
  const { data, error } = await supabase.from('app_config').select('ads_enabled, ads_feed_every, ads_vibes_every').single();
  if (error) throw error;
  return { enabled: !!data.ads_enabled, feedEvery: data.ads_feed_every, vibesEvery: data.ads_vibes_every };
}

export const adsConfigKey = ['ads-config'] as const;

/**
 * Os anúncios estão prontos para aparecer? (ligados no banco, no celular, com o app liberado e o
 * SDK iniciado com as regras certas para a idade da pessoa). Desligado, `every` = 0.
 */
export function useAds(): { ready: boolean; feedEvery: number; vibesEvery: number } {
  const { profile } = useAuth();
  const on = canShowAds && !!profile;
  const config = useQuery({ queryKey: adsConfigKey, queryFn: fetchAdsConfig, enabled: on, staleTime: 10 * 60_000 });
  const enabled = on && !!config.data?.enabled;
  // Idade da conta: menores de 18 só recebem anúncios para adolescentes (classificação T do Google).
  const account = useQuery({ queryKey: ['my-account'], queryFn: fetchMyAccount, enabled, staleTime: 10 * 60_000 });
  const minor = account.data ? account.data.is_minor : null;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || minor === null) return;
    let alive = true;
    initAds({ minor })
      .then((ok) => alive && setReady(ok))
      .catch(() => alive && setReady(false));
    return () => {
      alive = false;
    };
  }, [enabled, minor]);

  const live = enabled && ready && minor !== null;
  return live ? { ready: true, feedEvery: config.data!.feedEvery, vibesEvery: config.data!.vibesEvery } : { ready: false, feedEvery: 0, vibesEvery: 0 };
}

/** Linha do feed: um item ou um espaço de anúncio (slot numerado a partir de 1). */
export type WithAds<T> = { kind: 'item'; item: T } | { kind: 'ad'; slot: number };

/**
 * Intercala anúncios: um depois de cada `every` itens, nunca no fim da lista (anúncio só entre
 * itens). `every` <= 0 = sem anúncios. As posições não mudam quando chegam mais itens no fim
 * (o slot 1 é sempre depois do item `every`), então a lista não "pula" ao carregar mais.
 */
export function withAds<T>(items: T[], every: number): WithAds<T>[] {
  const rows: WithAds<T>[] = [];
  let slot = 0;
  items.forEach((item, i) => {
    rows.push({ kind: 'item', item });
    const count = i + 1;
    if (every > 0 && count % every === 0 && count < items.length) rows.push({ kind: 'ad', slot: ++slot });
  });
  return rows;
}
