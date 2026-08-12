import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      herdr: 'src/adapters/herdr/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
