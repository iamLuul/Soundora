// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Chave do cache escrita à mão (['feed']) num erro de digitação faz a tela não atualizar, sem
// aviso nenhum: as chaves ficam todas em src/lib/query-keys.ts.
const QUERY_KEY_MESSAGE = 'Use uma chave de src/lib/query-keys.ts (keys.x) em vez de escrever o array à mão.';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', '.maestro/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/query-keys.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "Property[key.name='queryKey'] > ArrayExpression", message: QUERY_KEY_MESSAGE },
        {
          selector: "CallExpression[callee.property.name=/^(setQueryData|getQueryData|setQueriesData|removeQueries|cancelQueries)$/] > ArrayExpression.arguments:first-child",
          message: QUERY_KEY_MESSAGE,
        },
      ],
    },
  },
]);
