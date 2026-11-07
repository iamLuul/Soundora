// Confere (deno check) ou testa (deno test) todas as Edge Functions de supabase/functions,
// sem lista escrita à mão: função nova entra sozinha. Pastas que começam com _ são código
// compartilhado (entram pelo import de quem usa).
//
//   node scripts/functions.mjs check   → npm run typecheck:functions
//   node scripts/functions.mjs test    → npm run test:functions
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'supabase', 'functions');
const mode = process.argv[2];
if (mode !== 'check' && mode !== 'test') {
  console.error('uso: node scripts/functions.mjs check|test');
  process.exit(2);
}

const functions = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(root, d.name, 'index.ts')))
  .map((d) => d.name)
  .sort();

const files = [];
for (const name of functions) {
  files.push(join('supabase/functions', name, 'index.ts'));
  if (existsSync(join(root, name, 'handler.test.ts'))) files.push(join('supabase/functions', name, 'handler.test.ts'));
}

const config = ['--config', 'supabase/functions/link-preview/deno.json'];
const args =
  mode === 'check'
    ? ['check', ...config, ...files]
    : ['test', ...config, ...files.filter((f) => f.endsWith('.test.ts'))];

console.log(`${mode === 'check' ? 'Conferindo' : 'Testando'} ${functions.length} funções: ${functions.join(', ')}`);
const deno = process.platform === 'win32' ? 'deno.cmd' : 'deno';
const run = spawnSync(join(import.meta.dirname, '..', 'node_modules', '.bin', deno), args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(run.status ?? 1);
