/** Junta dia/mês/ano digitados em AAAA-MM-DD. */
export function toIsoDate(day: string, month: string, year: string): string {
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
