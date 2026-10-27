import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { keys } from './queries';
import { supabase } from './supabase';

/** Aviso que chega do banco (migration live_notifications): só o tipo e o post, nada de quem fez. */
export interface LiveNotification {
  kind: string;
  post_id: string | null;
  removed?: boolean;
}

const KINDS = new Set(['like', 'comment', 'reply', 'follow', 'comment_reply', 'comment_like']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Avisos que chegam juntos (várias curtidas seguidas) viram uma atualização só. */
const BATCH_MS = 400;

/** Ignora qualquer coisa fora do formato esperado. */
export function parseLiveNotification(payload: unknown): LiveNotification | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.kind !== 'string' || !KINDS.has(p.kind)) return null;
  const postId = typeof p.post_id === 'string' && UUID.test(p.post_id) ? p.post_id : null;
  return { kind: p.kind, post_id: postId, removed: p.removed === true };
}

/** O que precisa ser buscado de novo por causa destes avisos (só refaz o que está na tela). */
export function keysToRefresh(events: LiveNotification[], me: { id: string; username: string }): QueryKey[] {
  const out = new Map<string, QueryKey>();
  const add = (k: QueryKey) => out.set(JSON.stringify(k), k);
  add(keys.unread);
  add(['notifications']);
  for (const e of events) {
    if (e.kind === 'follow') {
      add(keys.profile(me.username));
      add(['people', me.username]);
    } else if (e.post_id) {
      add(keys.post(e.post_id));
      if (e.kind !== 'like') add(keys.comments(e.post_id));
    }
  }
  return [...out.values()];
}

function refresh(qc: QueryClient, events: LiveNotification[], me: { id: string; username: string }) {
  for (const queryKey of keysToRefresh(events, me)) void qc.invalidateQueries({ queryKey });
}

/**
 * Notificações ao vivo: ouve o canal privado da pessoa no Supabase Realtime e atualiza o sino,
 * a lista de notificações, os comentários e os seguidores assim que algo acontece, sem
 * precisar puxar para atualizar. Se o Realtime cair, o sino continua se atualizando sozinho
 * a cada 30 s e ao voltar para o app (useUnreadNotifications).
 */
export function useLiveNotifications(me: { id: string; username: string } | null) {
  const qc = useQueryClient();
  const id = me?.id ?? null;
  const username = me?.username ?? '';

  useEffect(() => {
    if (!id || process.env.NODE_ENV === 'test') return;
    const who = { id, username };
    let channel: RealtimeChannel | null = null;
    let pending: LiveNotification[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dmTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let connectedBefore = false;

    const flush = () => {
      timer = null;
      const events = pending;
      pending = [];
      if (alive && events.length) refresh(qc, events, who);
    };

    void (async () => {
      // O canal é privado: entra com o token da sessão (o banco confere que é o seu canal).
      try {
        await supabase.realtime.setAuth();
      } catch {
        // Sem token novo: tenta com o que o cliente já tem.
      }
      if (!alive) return;
      channel = supabase
        .channel(`user:${id}`, { config: { private: true } })
        // Mensagem nova, lida, curtida ou desfeita: atualiza as conversas e a bolinha (o aviso
        // leva só o id da conversa; o resto vem das funções, que conferem quem pode ver).
        .on('broadcast', { event: 'dm' }, () => {
          dmTimer ??= setTimeout(() => {
            dmTimer = null;
            if (alive) void qc.invalidateQueries({ queryKey: ['dm'] });
          }, BATCH_MS);
        })
        .on('broadcast', { event: 'notification' }, ({ payload }) => {
          const event = parseLiveNotification(payload);
          if (!event) return;
          pending.push(event);
          timer ??= setTimeout(flush, BATCH_MS);
        })
        .subscribe((status) => {
          // Voltou a conectar depois de cair: busca o que pode ter chegado nesse meio tempo.
          if (status !== 'SUBSCRIBED') return;
          if (connectedBefore) {
            refresh(qc, [], who);
            void qc.invalidateQueries({ queryKey: ['dm'] });
          }
          connectedBefore = true;
        });
    })();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (dmTimer) clearTimeout(dmTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc, id, username]);
}
