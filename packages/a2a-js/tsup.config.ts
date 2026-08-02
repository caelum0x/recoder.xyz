import { defineConfig } from 'tsup';
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server/index.ts',
    'src/server/express/index.ts',
    'src/client/index.ts',
  ],
  format: ['esm', 'cjs'],
  // package.json declares dist/*.d.ts types entries — dts must stay on or TS
  // consumers hit TS7016 (caught by scripts/verify-dist-freshness.sh).
  dts: true,
  clean: true,
  external: ['express', 'uuid'],
});
