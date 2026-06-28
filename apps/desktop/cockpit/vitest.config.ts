/**
 * Vitest config for the cockpit package.
 *
 * Two tiers, both real (no production code is stubbed):
 *  - Unit tests (src/lib/*.test.ts) run in the default `node` environment: the
 *    lib code only touches `window` via guarded `typeof window !== 'undefined'`
 *    reads, so each test sets up its own minimal window/fetch test doubles.
 *  - The integration smoke harness (src/test/*.integration.test.tsx) opts into
 *    jsdom via a per-file `// @vitest-environment jsdom` pragma and renders the
 *    real <App/> Preact tree against a real in-process stub conductor server.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
});
