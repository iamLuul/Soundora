import { describe, expect, it } from 'vitest';
import { genresSchema, passwordSchema, postTextSchema, usernameSchema } from './validation.ts';

describe('usernameSchema', () => {
  it.each(['luul', 'dj.junin', 'raul_2026'])('aceita %s', (v) => expect(usernameSchema.parse(v)).toBe(v));
  it('normaliza para minúsculas', () => expect(usernameSchema.parse('  Raul ')).toBe('raul'));
  it.each(['ab', 'a'.repeat(21), 'com espaço', '.raul', 'raul.', 'ra..ul', 'raúl'])('recusa %s', (v) => {
    expect(usernameSchema.safeParse(v).success).toBe(false);
  });
});

describe('postTextSchema', () => {
  it('limita a 500 caracteres', () => {
    expect(postTextSchema.safeParse('a'.repeat(500)).success).toBe(true);
    expect(postTextSchema.safeParse('a'.repeat(501)).success).toBe(false);
  });
});

describe('genresSchema', () => {
  it('exige ao menos 3 gêneros conhecidos', () => {
    expect(genresSchema.safeParse(['indie', 'rock']).success).toBe(false);
    expect(genresSchema.safeParse(['indie', 'rock', 'lo_fi']).success).toBe(true);
    // Qualquer gênero do catálogo (milhares) passa no formato; o banco confere se existe.
    expect(genresSchema.safeParse(['indie', 'rock', 'dance_pop']).success).toBe(true);
    expect(genresSchema.safeParse(['indie', 'rock', 'Não Vale!']).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('exige de 10 a 72 caracteres, com letras e números', () => {
    expect(passwordSchema.safeParse('abc123456').error?.issues[0]?.message).toBe('password_too_short');
    expect(passwordSchema.safeParse('1234567890').error?.issues[0]?.message).toBe('password_needs_letters_digits');
    expect(passwordSchema.safeParse('senhaforte').error?.issues[0]?.message).toBe('password_needs_letters_digits');
    expect(passwordSchema.safeParse('senha-forte-1').success).toBe(true);
    expect(passwordSchema.safeParse('ação1234567').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(73)).success).toBe(false);
  });
});
