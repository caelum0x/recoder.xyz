import { defineConfig } from 'tsup';

// Dual CJS + ESM build so both module systems (e.g. CJS docker-backend and
// ESM consumers) can import @recoder/browser-tools from the published dist.
//
// playwright is a peerDependency and is referenced only via `import type`
// in the source, so it never appears in the runtime output. It is also
// listed in `external` defensively to guarantee tsup never bundles it even
// if a value-level lazy require is added later.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    // ESM output -> dist/index.js, CJS output -> dist/index.cjs
    // (package.json declares "type": "module", so .js is ESM).
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.js' };
    },
    external: ['playwright'],
  },
]);
