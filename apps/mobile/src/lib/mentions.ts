/** Pedaço de texto: comum ou uma menção (@username). */
export type TextPart = { text: string; mention: boolean };

// @ seguido de letras, números, _ e . (regra do @ no Soundhora). Não pega e-mail (letra antes do @).
const MENTION_RE = /(^|[^A-Za-z0-9_.@])(@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?)/g;

/** Separa o texto em pedaços, marcando as menções (o ponto final da frase fica de fora). */
export function splitMentions(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = (m.index ?? 0) + m[1]!.length;
    if (start > last) parts.push({ text: text.slice(last, start), mention: false });
    parts.push({ text: m[2]!, mention: true });
    last = start + m[2]!.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false });
  return parts;
}
