import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["@recoder/pi-agent-core", "@recoder/pi-ai", "@recoder/pi-tui", "@mariozechner/clipboard", "@silvia-odwyer/photon-node", "chalk", "cross-spawn", "diff", "glob", "highlight.js", "hosted-git-info", "ignore", "jiti", "minimatch", "proper-lockfile", "semver", "typebox", "undici", "yaml"],
});
