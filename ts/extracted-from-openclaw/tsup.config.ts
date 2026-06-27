import { defineConfig } from "tsup";

// @recoder/connectors foundation build. Only the owned src/ tree is compiled;
// the raw-extracted gateway-core/, social-gateways/, and agents/ trees are
// reference source for the per-channel adapter phase and are NOT part of the
// published foundation bundle.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
