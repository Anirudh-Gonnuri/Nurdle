// @ts-check
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'coverage/'],
  },

  js.configs.recommended,

  // Browser code: classic <script> files (not ES modules), loaded after the
  // Firebase compat SDK, which exposes the `firebase` global.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        firebase: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-implicit-globals': 'error',
      'no-shadow': 'error',
      'no-use-before-define': ['error', { functions: false }],
      'no-var': 'off', // legacy ES5 style; to be migrated when the code is modularised
      'prefer-const': 'off',
    },
  },

  // Tooling config files run in Node as ES modules.
  {
    files: ['*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
];
