import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  external: ["@recoder/pi-agent-core", "@recoder/pi-ai", "@recoder/pi-tui", "@silvia-odwyer/photon-node", "chalk", "cross-spawn", "diff", "glob", "highlight.js", "hosted-git-info", "ignore", "jiti", "minimatch", "proper-lockfile", "typebox", "undici", "yaml"],
});
