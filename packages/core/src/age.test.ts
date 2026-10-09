import { describe, expect, it } from 'vitest';
import { ageOn, checkAge, DEFAULT_AGE_POLICY } from './age.ts';

const today = new Date(Date.UTC(2026, 9, 9)); // 2026-10-09

describe('ageOn', () => {
  it('conta o aniversário só a partir do dia', () => {
    expect(ageOn('2010-10-09', today)).toBe(16);
    expect(ageOn('2010-10-10', today)).toBe(15);
  });
  it('recusa datas inválidas', () => {
    expect(ageOn('2010-02-30', today)).toBeNull();
    expect(ageOn('10/10/2010', today)).toBeNull();
  });
});

describe('checkAge', () => {
  it('abaixo da idade mínima', () => {
    expect(checkAge('2014-01-01', DEFAULT_AGE_POLICY, today)).toEqual({ status: 'too_young', age: 12 });
  });
  it('13 a 15 anos sem fluxo de responsável: bloqueia com aviso', () => {
    expect(checkAge('2012-01-01', DEFAULT_AGE_POLICY, today)).toEqual({ status: 'needs_guardian', age: 14 });
  });
  it('13 a 15 anos com fluxo de responsável ativo: libera como menor', () => {
    expect(checkAge('2012-01-01', { ...DEFAULT_AGE_POLICY, guardianFlowEnabled: true }, today)).toEqual({ status: 'ok', age: 14, isMinor: true });
  });
  it('16 e 17 anos: libera e marca como menor (sem anúncios segmentados)', () => {
    expect(checkAge('2009-06-01', DEFAULT_AGE_POLICY, today)).toEqual({ status: 'ok', age: 17, isMinor: true });
  });
  it('adulto', () => {
    expect(checkAge('1995-03-20', DEFAULT_AGE_POLICY, today)).toEqual({ status: 'ok', age: 31, isMinor: false });
  });
  it('idade mínima configurável (ex.: 18)', () => {
    expect(checkAge('2009-06-01', { ...DEFAULT_AGE_POLICY, minAge: 18 }, today).status).toBe('too_young');
  });
  it('data no futuro é inválida', () => {
    expect(checkAge('2030-01-01', DEFAULT_AGE_POLICY, today)).toEqual({ status: 'invalid' });
  });
});
