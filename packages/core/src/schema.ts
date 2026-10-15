/**
 * Validação mínima no formato que o app usa (parse, safeParse, error.issues[0].message,
 * options). Substitui o zod: o app só precisa de regras simples (tamanho, regex, regra
 * própria), e o zod levava ~1 MB ao JavaScript da web (incluindo mensagens em dezenas de
 * idiomas que o Soundhora não usa, porque mostra as próprias traduções pelo código do erro).
 */
export interface Issue {
  message: string;
}
export type SafeParseResult<T> = { success: true; data: T; error?: undefined } | { success: false; data?: undefined; error: { issues: Issue[] } };

export class ValidationError extends Error {
  constructor(readonly issues: Issue[]) {
    super(issues[0]?.message ?? 'invalid');
    this.name = 'ValidationError';
  }
}

export interface Schema<T> {
  safeParse(value: unknown): SafeParseResult<T>;
  parse(value: unknown): T;
}

type Check<T> = (value: T) => string | null;

function schema<T>(run: (value: unknown) => SafeParseResult<T>): Schema<T> {
  return {
    safeParse: run,
    parse(value) {
      const r = run(value);
      if (!r.success) throw new ValidationError(r.error.issues);
      return r.data;
    },
  };
}

const fail = (messages: string[]): SafeParseResult<never> => ({ success: false, error: { issues: messages.map((message) => ({ message })) } });

/** Texto: transformações (trim, minúsculas) e depois as regras, na ordem; junta todas as falhas. */
export function text(opts: { trim?: boolean; lowercase?: boolean } = {}, ...checks: Check<string>[]): Schema<string> {
  return schema<string>((value) => {
    if (typeof value !== 'string') return fail(['invalid_type']);
    let v = value;
    if (opts.trim) v = v.trim();
    if (opts.lowercase) v = v.toLowerCase();
    const errors = checks.map((c) => c(v)).filter((m): m is string => m !== null);
    return errors.length ? fail(errors) : { success: true, data: v };
  });
}

/** Lista: cada item passa pelo `item`; depois as regras da lista. */
export function list<T>(item: Schema<T>, ...checks: Check<T[]>[]): Schema<T[]> {
  return schema<T[]>((value) => {
    if (!Array.isArray(value)) return fail(['invalid_type']);
    const out: T[] = [];
    const errors: string[] = [];
    for (const v of value) {
      const r = item.safeParse(v);
      if (r.success) out.push(r.data);
      else errors.push(...r.error.issues.map((i) => i.message));
    }
    errors.push(...checks.map((c) => c(out)).filter((m): m is string => m !== null));
    return errors.length ? fail(errors) : { success: true, data: out };
  });
}

/** Um valor de uma lista fixa (com `options`, como o z.enum). */
export function oneOf<const O extends readonly string[]>(options: O, message = 'invalid_option'): Schema<O[number]> & { options: O } {
  return {
    options,
    ...schema<O[number]>((value) => (typeof value === 'string' && (options as readonly string[]).includes(value) ? { success: true, data: value as O[number] } : fail([message]))),
  };
}

export const minLength =
  (n: number, message: string) =>
  (v: { length: number }): string | null =>
    v.length >= n ? null : message;
export const maxLength =
  (n: number, message: string) =>
  (v: { length: number }): string | null =>
    v.length <= n ? null : message;
export const matches =
  (re: RegExp, message: string) =>
  (v: string): string | null =>
    re.test(v) ? null : message;
export const rule =
  <T>(ok: (v: T) => boolean, message: string) =>
  (v: T): string | null =>
    ok(v) ? null : message;
