import type { CommentRow } from './types';
import { uniqueBy } from './hooks';

/** Respostas que aparecem antes do "Ver mais" numa conversa recolhida. */
export const VISIBLE_REPLIES = 2;
/** Só recolhe conversas com mais que isso (esconder uma resposta só não vale o clique). */
export const COLLAPSE_OVER = 3;

export type CommentListRow =
  | { kind: 'comment'; key: string; item: CommentRow; continues: boolean }
  | { kind: 'toggle'; key: string; rootId: string; hidden: number; expanded: boolean };

/**
 * Monta a lista da tela: cada comentário seguido das respostas. Conversa grande começa
 * recolhida (as primeiras respostas e um "Ver mais N respostas"); aberta, termina com
 * "Mostrar menos". `continues` diz se a linha vertical da conversa segue para baixo.
 * A lista do servidor já vem com as respostas logo depois do comentário principal.
 */
export function buildCommentRows(list: CommentRow[], expanded: ReadonlySet<string>): CommentListRow[] {
  const comments = uniqueBy(list, (c) => c.id, 'comentários');
  const replies = new Map<string, CommentRow[]>();
  for (const c of comments) if (c.parent_id) replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c]);

  const rows: CommentListRow[] = [];
  for (const root of comments) {
    if (root.parent_id) continue;
    const all = replies.get(root.id) ?? [];
    const collapsible = all.length > COLLAPSE_OVER;
    const open = expanded.has(root.id);
    const shown = collapsible && !open ? all.slice(0, VISIBLE_REPLIES) : all;
    rows.push({ kind: 'comment', key: root.id, item: root, continues: shown.length > 0 });
    shown.forEach((r, i) => rows.push({ kind: 'comment', key: r.id, item: r, continues: collapsible || i < shown.length - 1 }));
    if (collapsible) rows.push({ kind: 'toggle', key: `toggle-${root.id}`, rootId: root.id, hidden: all.length - shown.length, expanded: open });
  }
  return rows;
}
