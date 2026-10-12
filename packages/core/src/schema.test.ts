import { describe, expect, it } from 'vitest';
import { list, matches, maxLength, minLength, oneOf, rule, text, ValidationError } from './schema.ts';

describe('validação mínima (substitui o zod)', () => {
  const name = text({ trim: true, lowercase: true }, minLength(3, 'curto'), maxLength(5, 'longo'), matches(/^[a-z]+$/, 'letras'));
  it('transforma antes de conferir e devolve o valor normalizado', () => {
    expect(name.parse('  ABC ')).toBe('abc');
    expect(name.safeParse('Ab')).toEqual({ success: false, error: { issues: [{ message: 'curto' }] } });
  });
  it('junta as falhas na ordem das regras; parse lança com a primeira', () => {
    expect(name.safeParse('a1').error?.issues.map((i) => i.message)).toEqual(['curto', 'letras']);
    expect(() => name.parse('x')).toThrow(ValidationError);
    expect(() => name.parse('x')).toThrow('curto');
    expect(name.safeParse(42).success).toBe(false);
  });
  it('lista: confere cada item e o tamanho', () => {
    const tags = list(text({}, matches(/^[a-z]+$/, 'item')), minLength(2, 'poucos'));
    expect(tags.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(tags.safeParse(['a']).error?.issues[0]?.message).toBe('poucos');
    expect(tags.safeParse(['a', 'B']).error?.issues[0]?.message).toBe('item');
    expect(tags.safeParse('a').success).toBe(false);
  });
  it('oneOf: opções fixas, com options', () => {
    const r = oneOf(['a', 'b'] as const);
    expect(r.options).toEqual(['a', 'b']);
    expect(r.parse('a')).toBe('a');
    expect(r.safeParse('c').success).toBe(false);
  });
  it('rule: regra própria', () => {
    const even = text({}, rule<string>((v) => v.length % 2 === 0, 'par'));
    expect(even.safeParse('ab').success).toBe(true);
    expect(even.safeParse('abc').error?.issues[0]?.message).toBe('par');
  });
});
