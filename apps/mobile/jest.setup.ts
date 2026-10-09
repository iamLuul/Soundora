// Variáveis falsas para que módulos que criam o cliente Supabase possam ser importados nos testes.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-key';
