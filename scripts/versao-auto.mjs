#!/usr/bin/env node
// Sobe a versão pelos commits de um push (roda no GitHub Actions: .github/workflows/versao.yml).
//
//   node scripts/versao-auto.mjs <antes> <depois> <arquivo-de-tags>
//
// Cada commit novo (sem os merges) sobe a versão pela marca na mensagem:
//   [grande]   mudança gigante (sair do beta): 0.52.1 → 1.0.0
//   [media]    funcionalidade nova (também [média]): 0.40.3 → 0.41.0
//   [pequena]  ajuste pequeno ou correção: 0.40.0 → 0.40.1
//   [nada]     não muda a versão (CI, testes, scripts, documentação)
// Sem marca: [pequena] se mexeu no app ou no servidor (apps/mobile, packages/core, supabase);
// senão, [nada]. MÊS/ANO são os da data do commit. Cada versão entra no CHANGELOG.md e vira
// uma tag no commit dela (escrita em <arquivo-de-tags>: "tag sha" por linha).
// Commits do próprio robô ([versao-auto]) são ignorados.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { addChangelog, bump, readVersion, root, show, tagName, writeVersion } from './versao-lib.mjs';

const [before, after, tagsFile = 'tags.txt'] = process.argv.slice(2);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

function isCommit(ref) {
  if (!ref || /^0+$/.test(ref)) return false;
  try {
    git('cat-file', '-e', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// Push normal: os commits entre antes e depois. Branch nova ou push forçado: só o último.
const range = isCommit(before) ? [`${before}..${after}`] : ['-1', after];
const shas = git('rev-list', '--reverse', '--no-merges', ...range).split('\n').filter(Boolean);

const APP_PATHS = /^(apps\/mobile\/(src|assets|app\.json|app\.config\.js)|packages\/core\/src|supabase\/(migrations|functions))/;
const MARK = /\[(grande|m[eé]dia|pequena|nada)\]/i;

export function kindOf(message, files) {
  const m = MARK.exec(message);
  if (m) {
    const k = m[1].toLowerCase().replace('é', 'e');
    return k === 'nada' ? null : k;
  }
  return files.some((f) => APP_PATHS.test(f)) ? 'pequena' : null;
}

let version = readVersion();
const start = show(version);
const tags = [];
for (const sha of shas) {
  const message = git('log', '-1', '--format=%B', sha);
  if (message.includes('[versao-auto]')) continue;
  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n').filter(Boolean);
  const kind = kindOf(message, files);
  const subject = message.split('\n')[0].replace(MARK, '').replace(/\s{2,}/g, ' ').trim();
  if (!kind) {
    console.log(`  ${sha.slice(0, 7)} sem mudança de versão · ${subject}`);
    continue;
  }
  const date = new Date(git('log', '-1', '--format=%aI', sha));
  version = bump(version, kind, date);
  addChangelog(kind, version, subject, date, sha.slice(0, 7));
  tags.push(`${tagName(version)} ${sha}`);
  console.log(`  ${sha.slice(0, 7)} ${kind} → ${show(version)} · ${subject}`);
}

if (tags.length) writeVersion(version);
writeFileSync(tagsFile, tags.join('\n') + (tags.length ? '\n' : ''));
console.log(tags.length ? `Versão: ${start} → ${show(version)}` : `Versão continua ${start}`);
