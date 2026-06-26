import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/seams/mcp-stdio.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
});
