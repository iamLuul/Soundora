#!/usr/bin/env node
// Muda a versão do Soundhora (apps/mobile/version.json): GRANDE.MÉDIA.PEQUENA.MÊS.ANO.
//
//   npm run versao                                   mostra a versão atual
//   npm run versao -- pequena "Ícone novo do sino"   ajuste pequeno ou correção: 0.40.0 → 0.40.1
//   npm run versao -- media "Mensagens diretas"      funcionalidade nova: 0.40.3 → 0.41.0
//   npm run versao -- grande --confirmar "Versão final"   mudança gigante: 0.52.1 → 1.0.0
//
// Subir um número zera os que vêm depois dele. MÊS e ANO viram os de hoje (horário de Brasília,
// ano com 2 dígitos). O texto entre aspas (opcional) entra no CHANGELOG.md.
// Durante o beta a GRANDE fica 0: "grande" só funciona com --confirmar.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const file = join(root, 'apps/mobile/version.json');
const pkgFile = join(root, 'apps/mobile/package.json');
const { parseVersion } = require(join(root, 'apps/mobile/version.js'));

const current = parseVersion(JSON.parse(readFileSync(file, 'utf8')).version);
const show = (v) => `${v.major}.${v.feature}.${v.fix}.${v.month}.${String(v.year).padStart(2, '0')}`;
const [kind, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith('--'));
const note = rest.filter((a) => !a.startsWith('--')).join(' ').trim();

if (!kind) {
  console.log(`Versão atual: ${show(current)}`);
  process.exit(0);
}

const next = { ...current };
if (kind === 'pequena') next.fix += 1;
else if (kind === 'media') Object.assign(next, { feature: current.feature + 1, fix: 0 });
else if (kind === 'grande') {
  if (!flags.includes('--confirmar')) {
    console.error('A GRANDE fica 0 durante o beta. Para mudar mesmo (ex.: versão final), use: npm run versao -- grande --confirmar');
    process.exit(1);
  }
  Object.assign(next, { major: current.major + 1, feature: 0, fix: 0 });
} else {
  console.error(`Tipo desconhecido: "${kind}". Use pequena, media ou grande.`);
  process.exit(1);
}

// Mês e ano de hoje no horário de Brasília.
const [month, year] = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric', year: 'numeric' })
  .format(new Date())
  .split('/')
  .map(Number);
Object.assign(next, { month, year: year % 100 });

writeFileSync(file, JSON.stringify({ version: show(next) }, null, 2) + '\n');
// package.json do app: só os 3 primeiros (o npm exige esse formato).
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
pkg.version = `${next.major}.${next.feature}.${next.fix}`;
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
const lockFile = join(root, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
if (lock.packages?.['apps/mobile']) {
  lock.packages['apps/mobile'].version = pkg.version;
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
}

// CHANGELOG.md: a versão nova no topo (MÉDIA/GRANDE abrem um grupo novo).
if (note) {
  const logFile = join(root, 'CHANGELOG.md');
  const log = readFileSync(logFile, 'utf8');
  const today = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const line = `- \`${show(next)}\` · ${today} · ${note}`;
  const firstGroup = log.indexOf('\n## ');
  let updated;
  if (kind === 'pequena' && firstGroup >= 0) {
    // Logo abaixo do título do grupo atual.
    const afterHeading = log.indexOf('\n\n', firstGroup + 1) + 2;
    updated = log.slice(0, afterHeading) + line + '\n' + log.slice(afterHeading);
  } else {
    const group = `## ${next.major}.${next.feature} · ${note}\n\n${line}\n\n`;
    updated = firstGroup >= 0 ? log.slice(0, firstGroup + 1) + group + log.slice(firstGroup + 1) : `${log}\n${group}`;
  }
  writeFileSync(logFile, updated);
}

console.log(`${show(current)} → ${show(next)}${note ? ' (no CHANGELOG.md)' : ''}`);
