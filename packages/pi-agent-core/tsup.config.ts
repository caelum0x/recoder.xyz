import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["@recoder/pi-ai", "@recoder/pi-ai/compat", "ignore", "typebox", "yaml"],
});
