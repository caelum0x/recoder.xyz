import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      '@next/next/no-img-element': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
];
