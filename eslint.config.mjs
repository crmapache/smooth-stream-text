import eslint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Each example is its own project with its own lint and typecheck, run in CI.
    ignores: [
      'dist/**',
      'playground/dist/**',
      'node_modules/**',
      'examples/**',
      'site-dist/**',
      'website/.vitepress/cache/**',
      'website/.vitepress/dist/**',
      'benchmarks/node_modules/**',
      'benchmarks/results/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/react/**/*.{ts,tsx}', 'tests/react.test.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Plain Node scripts: the tarball checks, the site build and the benchmarks.
    files: ['scripts/**', 'benchmarks/scripts/**'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        performance: 'readonly',
        setImmediate: 'readonly',
        setTimeout: 'readonly',
        Intl: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
