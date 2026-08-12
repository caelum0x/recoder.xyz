import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      loom: 'src/adapters/loom/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
