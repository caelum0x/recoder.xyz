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
    setupFiles: ['./tests/setup-llm.ts'],
    include: ['app/lib/.server/llm/**/*.test.ts'],
    exclude: ['node_modules', 'starters'],
  },
  resolve: {
    alias: {
      '~': new URL('./app', import.meta.url).pathname,
    },
  },
});
