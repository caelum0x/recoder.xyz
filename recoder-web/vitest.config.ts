import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'app/**/*.test.ts'],
    exclude: ['node_modules', 'starters', 'app/lib/.server/llm/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'starters/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '~': new URL('./app', import.meta.url).pathname,
    },
  },
});