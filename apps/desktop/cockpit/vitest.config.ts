/**
 * Vitest config for the cockpit package — self-contained unit tests for the
 * pure renderer logic in src/lib (api client, workspace-state, config).
 *
 * Runs in the node environment: the lib code only touches `window` via guarded
 * `typeof window !== 'undefined'` reads, so each test sets up its own minimal
 * window/fetch test doubles. No DOM/jsdom needed, no production code is stubbed.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
});
