import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Match Next's production JSX transform (automatic runtime). tsconfig's
  // `jsx: preserve` leaves esbuild on the classic `React.createElement` factory,
  // which throws `React is not defined` for any page that renders JSX without a
  // `React` import (as Next never requires one). Automatic runtime aligns the
  // test transform with production and is strictly more compatible.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      '__tests__/**/*.test.{ts,tsx}',
      'app/__tests__/**/*.test.{ts,tsx}',
      'app/**/__tests__/**/*.test.{ts,tsx}',
      'lib/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      '.next',
      'coverage',
      'dist',
      '__tests__/integration/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'components/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'app/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules/',
        '.next/',
        'coverage/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
