import { defineConfig } from "tsup";
const external = [
  "@recoder/daytona-api-client", "@recoder/daytona-toolbox-api-client",
  "axios", "busboy", "isomorphic-ws", "pathe", "shell-quote", "expand-tilde",
  "@aws-sdk/client-s3", "@aws-sdk/lib-storage",
];
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external,
});