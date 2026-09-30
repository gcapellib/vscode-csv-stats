// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '*.vsix', 'harness.html'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // La faute la plus coûteuse de ce projet, à plusieurs reprises : une
      // variable déclarée, jamais lue — signe d'une extraction ou d'un
      // renommage qui a laissé un morceau derrière lui.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Le webview lit `message.type` sur des objets venus de postMessage,
      // jamais typés à la source : interdire `any` explicite forcerait des
      // assertions partout sans rien garantir de plus.
      '@typescript-eslint/no-explicit-any': 'off',
      // core/types.ts reconnaît l'espace insécable comme séparateur de
      // milliers — un regex qui en contient un n'est pas une faute de frappe.
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
);
