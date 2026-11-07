// API do app: uma função por ação, chamando o Supabase (funções do banco e Edge Functions).
// Cada arquivo cuida de um assunto; as telas importam daqui (`lib/api`), nunca dos arquivos.
// Funcionalidade nova: crie `lib/api/<assunto>.ts` e acrescente a linha abaixo.
export * from './config';
export * from './profile';
export * from './posts';
export * from './media';
export * from './social';
export * from './settings';
export * from './music';
export * from './reviews';
export * from './notifications';
export * from './vibes';
export * from './messages';
export * from './communities';
