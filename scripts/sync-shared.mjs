#!/usr/bin/env node
// Copia o código do indexador de links (packages/core/src/links) para
// supabase/functions/_shared/links, porque o deploy da Edge Function só
// empacota arquivos dentro de supabase/functions.
//
//   node scripts/sync-shared.mjs          copia
//   node scripts/sync-shared.mjs --check  só confere (usado no CI)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['platforms.ts', 'preview.ts', 'genres.ts', 'charts.ts', 'discover.ts'];
const from = join(root, 'packages/core/src/links');
const to = join(root, 'supabase/functions/_shared/links');
const header = '// ARQUIVO GERADO por scripts/sync-shared.mjs a partir de packages/core/src/links. Não edite aqui.\n';
const check = process.argv.includes('--check');

let stale = [];
mkdirSync(to, { recursive: true });
for (const f of files) {
  const expected = header + readFileSync(join(from, f), 'utf8');
  const target = join(to, f);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === expected) continue;
  if (check) stale.push(f);
  else writeFileSync(target, expected);
}

if (stale.length) {
  console.error(`Desatualizado em supabase/functions/_shared/links: ${stale.join(', ')}. Rode: npm run sync:shared`);
  process.exit(1);
}
console.log(check ? 'Código compartilhado em dia.' : 'Código compartilhado copiado.');
