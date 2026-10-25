#!/usr/bin/env node
// Muda a versão do Soundhora (apps/mobile/version.json): GRANDE.MÉDIA.PEQUENA.MÊS.ANO.
//
//   npm run versao                 mostra a versão atual
//   npm run versao -- pequena      ajuste pequeno (fonte, botão, ícone): 0.1.0 → 0.1.1
//   npm run versao -- media        funcionalidade nova: 0.1.4 → 0.2.0
//   npm run versao -- grande       mudança gigante (ex.: sair do beta): 0.7.3 → 1.0.0
//
// Subir um número zera os que vêm depois dele. MÊS e ANO viram os de hoje (horário de Brasília).
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
const show = (v) => `${v.major}.${v.feature}.${v.fix}.${v.month}.${v.year}`;
const [kind, ...flags] = process.argv.slice(2);

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
Object.assign(next, { month, year });

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

console.log(`${show(current)} → ${show(next)}`);
