// Funções da versão GRANDE.MÉDIA.PEQUENA.MÊS.ANO, usadas por versao.mjs (à mão) e
// versao-auto.mjs (GitHub Actions, pela marca no commit).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { parseVersion } = require(join(root, 'apps/mobile/version.js'));
const versionFile = join(root, 'apps/mobile/version.json');
const pkgFile = join(root, 'apps/mobile/package.json');
const lockFile = join(root, 'package-lock.json');
const logFile = join(root, 'CHANGELOG.md');

export const KINDS = ['pequena', 'media', 'grande'];

export function readVersion() {
  return parseVersion(JSON.parse(readFileSync(versionFile, 'utf8')).version);
}

export function show(v) {
  return `${v.major}.${v.feature}.${v.fix}.${v.month}.${String(v.year).padStart(2, '0')}`;
}

/** Mês e ano (2 dígitos) de uma data no horário de Brasília. */
export function monthYear(date = new Date()) {
  const [month, year] = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric', year: 'numeric' })
    .format(date)
    .split('/')
    .map(Number);
  return { month, year: year % 100 };
}

/** Dia/mês/ano no horário de Brasília (para o CHANGELOG). */
export function dayLabel(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
}

/** Sobe um número (zera os seguintes) e põe o mês/ano da data. */
export function bump(v, kind, date = new Date()) {
  const next = { ...v, ...monthYear(date) };
  if (kind === 'pequena') next.fix += 1;
  else if (kind === 'media') Object.assign(next, { feature: v.feature + 1, fix: 0 });
  else if (kind === 'grande') Object.assign(next, { major: v.major + 1, feature: 0, fix: 0 });
  else throw new Error(`Tipo desconhecido: "${kind}". Use pequena, media ou grande.`);
  return next;
}

/** Grava a versão em version.json e (3 números) no package.json do app e no package-lock. */
export function writeVersion(v) {
  writeFileSync(versionFile, JSON.stringify({ version: show(v) }, null, 2) + '\n');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  pkg.version = `${v.major}.${v.feature}.${v.fix}`;
  writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  if (lock.packages?.['apps/mobile']) {
    lock.packages['apps/mobile'].version = pkg.version;
    writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  }
}

/** Põe a versão no topo do CHANGELOG.md (MÉDIA/GRANDE abrem um grupo novo). `ref`: o commit. */
export function addChangelog(kind, v, note, date = new Date(), ref = '') {
  const log = readFileSync(logFile, 'utf8');
  const line = `- \`${show(v)}\` · ${dayLabel(date)} · ${note}${ref ? ` (${ref})` : ''}`;
  const firstGroup = log.indexOf('\n## ');
  let updated;
  if (kind === 'pequena' && firstGroup >= 0) {
    const afterHeading = log.indexOf('\n\n', firstGroup + 1) + 2;
    updated = log.slice(0, afterHeading) + line + '\n' + log.slice(afterHeading);
  } else {
    const group = `## ${v.major}.${v.feature} · ${note}\n\n${line}\n\n`;
    updated = firstGroup >= 0 ? log.slice(0, firstGroup + 1) + group + log.slice(firstGroup + 1) : `${log}\n${group}`;
  }
  writeFileSync(logFile, updated);
}

/** Nome da tag no GitHub. */
export const tagName = (v) => `v${show(v)}`;
