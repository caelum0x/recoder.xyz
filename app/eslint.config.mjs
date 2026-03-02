export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  },
  {
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'off',
    },
  },
];
