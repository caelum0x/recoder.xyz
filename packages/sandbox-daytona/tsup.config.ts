import { defineConfig } from "tsup";
const external = [
  "@recoder/daytona-api-client", "@recoder/daytona-toolbox-api-client",
  "axios", "busboy", "isomorphic-ws", "pathe", "shell-quote", "expand-tilde",
  "@aws-sdk/client-s3", "@aws-sdk/lib-storage",
  // Optional, lazily-`dynamicRequire`/`dynamicImport`d at runtime (Image.ts,
  // ObjectStorage.ts, utils/Runtime.ts) — esbuild still tries to statically
  // resolve the string literal at build time unless marked external here.
  "fast-glob", "@iarna/toml", "dotenv", "tar", "form-data",
];
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external,
});