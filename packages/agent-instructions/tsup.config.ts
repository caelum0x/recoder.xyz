import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: [
      'src/index.ts',
      'src/agent-os-compiler.ts',
      'src/compiler.ts',
      'src/source-loader.ts',
      'src/provenance.ts',
      'src/claude-renderer.ts',
      'src/codex-renderer.ts',
      'src/recoder-code-renderer.ts',
    ],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
  },
]);
