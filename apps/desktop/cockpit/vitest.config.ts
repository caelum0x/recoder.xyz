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
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Resolve `@recoder/conductor-ui` (and its subpath exports) to the package
 * SOURCE. apps/desktop is excluded from the pnpm workspace, so there is no
 * workspace symlink and the package ships no prebuilt dist during dev/test —
 * pointing the alias at src/ lets the cockpit genuinely import and exercise the
 * real typed ConductorClient under Vitest without a separate build step.
 */
const conductorUiSrc = (file: string): string =>
  fileURLToPath(new URL(`../../../packages/conductor-ui/src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@recoder/conductor-ui/client': conductorUiSrc('client.ts'),
      '@recoder/conductor-ui/types': conductorUiSrc('types.ts'),
      '@recoder/conductor-ui': conductorUiSrc('index.ts'),
    },
  },
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
