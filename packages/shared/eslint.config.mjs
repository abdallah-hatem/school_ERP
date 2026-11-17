// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * packages/shared is plain TypeScript used by both apps. It must import no framework:
 * no NestJS, React, Next.js or Prisma (docs/ARCHITECTURE.md → Enforcing the module rules).
 * dependency-cruiser checks the same rule in CI.
 */
const FRAMEWORK_BAN =
  'packages/shared imports no framework (NestJS, React, Next.js, Prisma). Keep it plain TypeScript.';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', 'react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*', '@prisma/*', 'prisma'],
              message: FRAMEWORK_BAN,
            },
          ],
        },
      ],
    },
  },
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: { ...globals.node } } },
  prettier,
);
