#!/usr/bin/env node
// Confere que nenhuma chave secreta foi parar no repositório ou no código do app.
// A chave secreta (sb_secret_... ou JWT com role "service_role") ignora o RLS: se vazar,
// qualquer pessoa lê e apaga o banco inteiro. Ela só existe nas Edge Functions, como
// variável de ambiente que o próprio Supabase injeta.
//
//   node scripts/check-secrets.mjs   (roda no CI)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];

const BINARY = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|zip|pdf)$/i;
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/;
const CLIENT = /^(apps\/mobile|packages)\//;

function isServiceJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

for (const file of files) {
  if (ENV_FILE.test(file) && !file.endsWith('.example')) problems.push(`${file}: arquivo .env no Git (use .env.example e deixe o real fora)`);
  if (BINARY.test(file)) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(content)) problems.push(`${file}: chave secreta (sb_secret_...)`);
  for (const jwt of content.match(/eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g) ?? []) {
    if (isServiceJwt(jwt)) problems.push(`${file}: JWT com role service_role`);
  }
  if (CLIENT.test(file) && !file.includes('__tests__') && !file.endsWith('key-guard.ts')) {
    if (/EXPO_PUBLIC_\w*(SECRET|SERVICE)/i.test(content)) problems.push(`${file}: variável EXPO_PUBLIC_ com chave secreta (tudo que é EXPO_PUBLIC_ vai para o app)`);
    if (/service_role|SUPABASE_SECRET_KEYS|SERVICE_ROLE_KEY/.test(content)) problems.push(`${file}: o app não pode usar a chave secreta`);
  }
}

if (problems.length) {
  console.error('Possível vazamento de chave secreta:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Nenhuma chave secreta em ${files.length} arquivos.`);
