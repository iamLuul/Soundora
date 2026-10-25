// Versão GRANDE.MÉDIA.PEQUENA.MÊS.ANO: o que vai para o app e o que vai para as lojas.
/* eslint-disable @typescript-eslint/no-require-imports -- version.js é CommonJS (lido pelo app.config.js) */
const { parseVersion, displayVersion, storeVersion, buildNumber } = require('../version.js');
const appConfig = require('../app.config.js');

test('5 números no app, 3 nas lojas, número do build que sempre sobe', () => {
  expect(displayVersion).toMatch(/^0\.\d+\.\d+\.\d{1,2}\.\d{2}$/);
  expect(storeVersion).toBe(displayVersion.split('.').slice(0, 3).join('.'));
  const config = appConfig({ config: require('../app.json').expo });
  expect(config.version).toBe(storeVersion);
  expect(config.extra.displayVersion).toBe(displayVersion);
  expect(config.ios.buildNumber).toBe(String(buildNumber));
  expect(config.android.versionCode).toBe(buildNumber);
  expect(config.ios.bundleIdentifier).toBe('app.soundhora');
});

test('subir qualquer número aumenta o build', () => {
  const build = (v: string) => {
    const p = parseVersion(v);
    return p.major * 1_000_000 + p.feature * 1_000 + p.fix;
  };
  expect(build('0.1.1.10.26')).toBeGreaterThan(build('0.1.0.10.26'));
  expect(build('0.2.0.11.26')).toBeGreaterThan(build('0.1.9.10.26'));
  expect(build('1.0.0.1.27')).toBeGreaterThan(build('0.99.99.12.26'));
});

test('formato inválido é recusado', () => {
  expect(() => parseVersion('1.0.0')).toThrow(/inválida/);
  expect(() => parseVersion('0.1.0.10.2026')).toThrow(/inválida/); // ano com 2 dígitos
  expect(() => parseVersion('0.1.0.13.26')).toThrow(/Mês/);
});
