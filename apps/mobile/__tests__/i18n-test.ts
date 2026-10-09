import en from '../src/locales/en.json';
import ptBR from '../src/locales/pt-BR.json';
import i18n, { relativeTime } from '../src/lib/i18n';

function flatKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe('traduções', () => {
  test('português e inglês têm exatamente as mesmas chaves', () => {
    expect(flatKeys(en).sort()).toEqual(flatKeys(ptBR).sort());
  });

  test('nenhum texto vazio', () => {
    for (const dict of [en, ptBR]) {
      const values = flatKeys(dict).map((k) => k.split('.').reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], dict));
      expect(values.every((v) => typeof v === 'string' && v.trim().length > 0)).toBe(true);
    }
  });

  test('tempo relativo', async () => {
    await i18n.changeLanguage('pt-BR');
    const now = new Date('2026-10-09T12:00:00Z');
    expect(relativeTime('2026-10-09T11:59:40Z', now)).toBe('agora');
    expect(relativeTime('2026-10-09T11:55:00Z', now)).toBe('5 min');
    expect(relativeTime('2026-10-09T09:00:00Z', now)).toBe('3 h');
    expect(relativeTime('2026-10-07T12:00:00Z', now)).toBe('2 d');
    await i18n.changeLanguage('en');
    expect(relativeTime('2026-10-09T09:00:00Z', now)).toBe('3h');
  });
});
