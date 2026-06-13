import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '.claude/**', '**/*.cjs'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript already resolves identifiers; no-undef is redundant and flags
      // browser/node globals that the typechecker handles correctly.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The deterministic core: no wall-clock, no Math.random. Enforced harder here.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Core is deterministic: inject a seeded PRNG.' },
        { object: 'Date', property: 'now', message: 'Core is deterministic: inject the clock.' },
        { object: 'performance', property: 'now', message: 'Core is deterministic: inject the clock.' },
      ],
    },
  },
];
