// 全仓库统一 ESLint 配置（pnpm monorepo）。
// 目标：在不大规模重构既有代码的前提下，统一基础规则并守住关键约束
// （如 React Hooks 规则——禁止在列表 .map() 内调用 hook，见 AGENTS.md）。
module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'out/',
    'build/',
    '.next/',
    'release/',
    'coverage/',
    '**/*.d.ts',
    'apps/desktop/out/',
    'apps/extension/dist/',
    'apps/extension/browser-polyfill.js',
    'packages/shared/dist/',
    'packages/shared/esm/',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-console': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'smart'],
    'no-throw-literal': 'error',
  },
  overrides: [
    {
      // 渲染层（React）：守住 Hooks 规则
      files: ['**/*.tsx', 'apps/desktop/src/renderer/**/*.ts'],
      plugins: ['react', 'react-hooks'],
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      settings: { react: { version: 'detect' } },
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/no-unescaped-entities': 'off',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
      },
    },
    {
      // 浏览器插件 / MCP：纯 JS，跨文件共享全局，规则放宽
      files: ['apps/extension/**/*.js', 'apps/mcp/**/*.js', '**/*.cjs', '**/*.mjs'],
      env: { browser: true, webextensions: true, node: true },
      globals: { chrome: 'readonly', browser: 'readonly' },
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        'no-empty': 'off',
      },
    },
  ],
};
