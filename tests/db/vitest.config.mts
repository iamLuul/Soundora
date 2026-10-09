import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/global-setup.ts'],
    // Todos os arquivos usam o mesmo banco: rodar em sequência.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
