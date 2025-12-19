module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12, // or higher, e.g., 2021
    sourceType: 'module',
    project: './tsconfig.json', // Specify project for type-aware linting
  },
  plugins: [
    'react',
    '@typescript-eslint',
  ],
  settings: {
    react: {
      version: 'detect', // Automatically detect the React version
    },
  },
  rules: {
    // Add custom rules here if needed
    // Example: 'react/react-in-jsx-scope': 'off', // Not needed for React 17+ with new JSX transform
  },
};
