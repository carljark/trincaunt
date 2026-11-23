import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from '@eslint-react/eslint-plugin';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs['recommended-typescript'],
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: globals.browser,
    },
    // Reglas de hooks y estilo que no comprobaba eslint-plugin-react (el plugin anterior)
    rules: {
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/use-state': 'off',
      '@eslint-react/naming-convention-ref-name': 'off',
      '@eslint-react/no-unnecessary-use-prefix': 'off',
      '@eslint-react/web-api-no-leaked-fetch': 'off',
      '@eslint-react/no-array-index-key': 'off',
    },
  },
);
