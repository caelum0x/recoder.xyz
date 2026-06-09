import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/domain/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
