import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: [
      'src/index.ts',
      'src/secret-scan.ts',
      'src/artifact-capture.ts',
      'src/memory-candidate.ts',
    ],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
