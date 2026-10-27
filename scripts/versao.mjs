#!/usr/bin/env node
// Muda a versão do Soundhora à mão (apps/mobile/version.json): GRANDE.MÉDIA.PEQUENA.MÊS.ANO.
// Normalmente não precisa: o GitHub sobe a versão sozinho pela marca no commit
// ([media], [pequena], [grande], [nada]; ver scripts/versao-auto.mjs). Isto é para exceções.
//
//   npm run versao                                   mostra a versão atual
//   npm run versao -- pequena "Ícone novo do sino"   ajuste pequeno ou correção: 0.40.0 → 0.40.1
//   npm run versao -- media "Mensagens diretas"      funcionalidade nova: 0.40.3 → 0.41.0
//   npm run versao -- grande --confirmar "Versão final"   mudança gigante: 0.52.1 → 1.0.0
//
// Subir um número zera os que vêm depois dele. MÊS e ANO viram os de hoje (horário de Brasília,
// ano com 2 dígitos). O texto entre aspas (opcional) entra no CHANGELOG.md.
// Durante o beta a GRANDE fica 0: "grande" só funciona com --confirmar.
// Commit com a versão mudada à mão: marque [nada] (senão o GitHub sobe de novo).
import { addChangelog, bump, readVersion, show, writeVersion } from './versao-lib.mjs';

const current = readVersion();
const [kind, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith('--'));
const note = rest.filter((a) => !a.startsWith('--')).join(' ').trim();

if (!kind) {
  console.log(`Versão atual: ${show(current)}`);
  process.exit(0);
}
if (kind === 'grande' && !flags.includes('--confirmar')) {
  console.error('A GRANDE fica 0 durante o beta. Para mudar mesmo (ex.: versão final), use: npm run versao -- grande --confirmar');
  process.exit(1);
}

let next;
try {
  next = bump(current, kind);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
writeVersion(next);
if (note) addChangelog(kind, next, note);
console.log(`${show(current)} → ${show(next)}${note ? ' (no CHANGELOG.md)' : ''}`);
