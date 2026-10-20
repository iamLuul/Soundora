// Desenhos dos selos do perfil (o banco guarda só o nome do desenho em badges.icon).
// Todos em 64 x 64, nas cores do app. Um selo novo precisa do desenho aqui; sem desenho,
// aparece a medalha genérica.

const svg = (body: string) => `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

/** Medalhão roxo com o aro claro, a base de todos os selos. */
const BASE = `<circle cx="32" cy="32" r="30" fill="#6C62FF"/><circle cx="32" cy="32" r="25" stroke="#B3A9EB" stroke-width="2" stroke-dasharray="3 3"/>`;

export const badgeIcons: Record<string, string> = {
  // Contribuidor inicial: coração com uma faísca (apoiou no começo).
  early_supporter: svg(
    `${BASE}<path d="M32 45c-9.5-6.3-14-11.2-14-16.6 0-3.9 3-6.9 6.8-6.9 2.9 0 5.3 1.7 7.2 4.6 1.9-2.9 4.3-4.6 7.2-4.6 3.8 0 6.8 3 6.8 6.9 0 5.4-4.5 10.3-14 16.6z" fill="#FFFFFF"/><path d="M45 14.5l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#FFFFFF"/>`,
  ),
  // Medalha genérica (selo sem desenho próprio).
  medal: svg(`${BASE}<path d="M32 18l4.1 8.4 9.2 1.3-6.7 6.5 1.6 9.2L32 39l-8.2 4.4 1.6-9.2-6.7-6.5 9.2-1.3z" fill="#FFFFFF"/>`),
};

export function badgeIcon(name: string): string {
  return badgeIcons[name] ?? badgeIcons.medal!;
}
