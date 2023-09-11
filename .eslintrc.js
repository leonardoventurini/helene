module.exports = {
  parser: '@typescript-eslint/parser',

  plugins: ['react-hooks', 'prettier', 'react'],

  globals: {
    Meteor: 'readonly',
    Helene: 'readonly',
  },

  env: {
    node: true,
    browser: true,
    mocha: true,
  },

  extends: [
    'eslint:recommended',
    'plugin:prettier/recommended',
    'plugin:react/recommended',
    'prettier',
  ],

  rules: {
    'no-console': 0,
    'react/prop-types': 0,
    'react/jsx-curly-spacing': 0,
    'react/display-name': 0,
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 0,
    'no-inner-declarations': 0,
    'react/no-unescaped-entities': 0,
    'react/react-in-jsx-scope': 0,
  },

  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 0,
        '@typescript-eslint/no-explicit-any': 0,
        '@typescript-eslint/no-empty-interface': 0,
        '@typescript-eslint/explicit-module-boundary-types': 0,
        '@typescript-eslint/no-unused-vars': 0,
        '@typescript-eslint/no-this-alias': 0,
        '@typescript-eslint/ban-ts-comment': 0,
        '@typescript-eslint/no-namespace': 0,
        '@typescript-eslint/no-empty-function': 0,
        '@typescript-eslint/no-extra-semi': 0,
      },
    },
  ],

  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },

  settings: {
    react: {
      version: 'detect',
    },
  },
}
