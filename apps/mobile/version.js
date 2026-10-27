// Versão do Soundhora: GRANDE.MÉDIA.PEQUENA.MÊS.ANO (ex.: 0.40.0.10.26; ano com 2 dígitos).
//   GRANDE  mudança gigante (sistema novo, sair do beta para a versão final). 0 durante o beta.
//   MÉDIA   funcionalidade nova.
//   PEQUENA ajuste pequeno (fonte, botão, ícone...).
//   MÊS.ANO quando a mudança foi feita (ano com os 2 últimos dígitos: 26 = 2026).
// Histórico em CHANGELOG.md.
// Fonte única: version.json. Para mudar, use `npm run versao -- media` (ver scripts/versao.mjs).
//
// As lojas só aceitam até 3 números na versão (iOS: CFBundleShortVersionString). Por isso:
//   - versão das lojas (expo.version) ......... GRANDE.MÉDIA.PEQUENA (ex.: 0.1.0)
//   - número do build (iOS buildNumber / Android versionCode), que precisa sempre subir:
//       GRANDE * 1.000.000 + MÉDIA * 1.000 + PEQUENA (ex.: 40000)
//   - versão mostrada no app (extra.displayVersion) ... os 5 números.
const { version } = require('./version.json');

function parseVersion(text) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d{1,2})\.(\d{2})$/.exec(String(text).trim());
  if (!m) throw new Error(`Versão inválida em version.json: "${text}" (use GRANDE.MÉDIA.PEQUENA.MÊS.ANO, ex.: 0.40.0.10.26)`);
  const [major, feature, fix, month, year] = m.slice(1).map(Number);
  if (month < 1 || month > 12) throw new Error(`Mês inválido na versão: ${month}`);
  if (feature > 999 || fix > 999) throw new Error('MÉDIA e PEQUENA vão até 999 (o número do build depende disso)');
  return { major, feature, fix, month, year };
}

const parts = parseVersion(version);

module.exports = {
  parseVersion,
  parts,
  /** Os 5 números, como aparece no app. */
  displayVersion: `${parts.major}.${parts.feature}.${parts.fix}.${parts.month}.${String(parts.year).padStart(2, '0')}`,
  /** O que vai para as lojas (3 números). */
  storeVersion: `${parts.major}.${parts.feature}.${parts.fix}`,
  /** Número do build (sempre sobe a cada versão). */
  buildNumber: parts.major * 1_000_000 + parts.feature * 1_000 + parts.fix,
};
