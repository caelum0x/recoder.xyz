import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.{js,mjs}'],
    testTimeout: 10000,
  },
});
