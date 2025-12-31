import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules (non-type-aware; fast and "basic")
  ...tseslint.configs.recommended,

  // Repo/build output ignores
  {
    ignores: ['dist/**', 'drizzle/**', 'node_modules/**'],
  },

  // Node/Azure Functions defaults
  {
    files: ['**/*.{ts,tsx,js,cjs,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Keep this repo friendly during early development.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  }
);
