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

/** Same rationale for @recoder/design-tokens: resolve to package SOURCE. */
const designTokensSrc = fileURLToPath(
  new URL('../../../packages/design-tokens/src/index.ts', import.meta.url),
);

/**
 * Same rationale for @recoder/shared/animations/preact: resolve to package
 * SOURCE. This is the Preact-native entry (hooks bound to `preact/hooks`), so
 * the cockpit consumes the smooth-text hook without ever pulling preact/compat.
 */
const sharedAnimationsPreactSrc = fileURLToPath(
  new URL('../../../shared/src/animations/preact/index.ts', import.meta.url),
);

/**
 * Dedupe `preact` to the cockpit's OWN single copy.
 *
 * The shared animation hooks (`@recoder/shared/animations/preact`) import from
 * bare `preact/hooks`. Resolved from the shared package's location, that would
 * otherwise pick up a DIFFERENT physical preact (repo-root node_modules) than
 * the cockpit's renderer — two copies share no hook dispatcher (`options`), so
 * the hook crashes (`Cannot read properties of undefined (reading '__H')`).
 * Anchored regex aliases force both `preact` core and `preact/hooks` onto the
 * cockpit's copy, exactly as a real bundler dedupes a singleton dependency.
 * Other subpaths (`preact/jsx-runtime`, `preact/test-utils`) are intentionally
 * left to normal resolution.
 */
const cockpitPreact = fileURLToPath(new URL('./node_modules/preact/dist/preact.mjs', import.meta.url));
const cockpitPreactHooks = fileURLToPath(
  new URL('./node_modules/preact/hooks/dist/hooks.mjs', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^preact\/hooks$/, replacement: cockpitPreactHooks },
      { find: /^preact$/, replacement: cockpitPreact },
      { find: '@recoder/conductor-ui/client', replacement: conductorUiSrc('client.ts') },
      { find: '@recoder/conductor-ui/types', replacement: conductorUiSrc('types.ts') },
      { find: '@recoder/conductor-ui', replacement: conductorUiSrc('index.ts') },
      { find: '@recoder/design-tokens', replacement: designTokensSrc },
      { find: '@recoder/shared/animations/preact', replacement: sharedAnimationsPreactSrc },
    ],
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
