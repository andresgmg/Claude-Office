import typescriptEslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import claudeOfficePlugin from './eslint-rules/claude-office-rules.mjs';

export default [
  {
    files: ['**/*.ts'],
  },
  {
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
      'simple-import-sort': simpleImportSort,
      'claude-office': claudeOfficePlugin,
    },

    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],

      curly: 'error',
      eqeqeq: 'error',
      'no-throw-literal': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'claude-office/no-inline-colors': 'error',
    },
  },
  eslintConfigPrettier,
];
