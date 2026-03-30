import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Prefer typed code; warnings keep CI green while files are tightened incrementally.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Syncing form state when a modal opens is a common pattern; full refactors use keys/inner components.
      'react-hooks/set-state-in-effect': 'warn',
      // React Compiler rule conflicts with intentional stable useCallback deps in a few places.
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])
