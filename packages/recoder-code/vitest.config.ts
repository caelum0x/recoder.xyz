import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The `vscode` npm package has no runtime entry (it is the extension
      // host API). The companion suites vi.mock it with factories, but the
      // static import must still resolve — point it at an empty stub.
      vscode: path.resolve(
        import.meta.dirname,
        'test-stubs/vscode-empty-stub.ts',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Vendored external subtrees (openagent, claw-code, codex, ...) ship
      // bun:test suites that cannot run under vitest/node. Tracked in
      // bd recoder-d91g (vendored-fork test cleanup).
      'packages/core/src/external/**',
      // Known-broken fork suites (missing @qwen-code/qwen-code-test-utils /
      // msw / mock-fs / memfs dev deps, @jest/globals imports, and stale
      // mocks/assertions). Listed explicitly so new suites are gated by
      // default. Tracked in bd recoder-d91g.
      ...knownBrokenSuites(),
    ],
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

function knownBrokenSuites(): string[] {
  const listFile = path.resolve(
    import.meta.dirname,
    'test-known-broken-suites.json',
  );
  if (!existsSync(listFile)) {
    return [];
  }
  return JSON.parse(readFileSync(listFile, 'utf8')) as string[];
}
