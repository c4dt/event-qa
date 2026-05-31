import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';

export default [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  ...svelte.configs['flat/recommended'].map((cfg) => {
    if (!cfg.files?.some((f) => String(f).includes('.svelte'))) return cfg;
    return {
      ...cfg,
      languageOptions: {
        ...cfg.languageOptions,
        parserOptions: {
          ...(cfg.languageOptions?.parserOptions ?? {}),
          parser: tsparser,
        },
      },
    };
  }),
  {
    ignores: ['.svelte-kit/**', 'build/**', 'node_modules/**'],
  },
];
