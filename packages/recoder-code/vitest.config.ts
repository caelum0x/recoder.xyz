import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['packages/cli/src/ui/**', 'jsdom'],
      ['packages/cli/src/ui/**/**', 'jsdom'],
      ['packages/cli/src/ui/hooks/**', 'jsdom'],
      ['packages/cli/src/ui/components/**', 'jsdom'],
    ],
    setupFiles: [
      'packages/core/test-setup.ts',
      'packages/cli/test-setup.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test-utils/**'
      ]
    }
  }
});
