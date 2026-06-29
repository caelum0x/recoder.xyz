import { defineConfig } from "tsup";
export default defineConfig({
  // `index` = the library entry; `cli` = the runnable `pi` binary. src/cli.ts has
  // the `#!/usr/bin/env node` shebang; building it is what makes `pi` a real
  // installable command the conductor can launch headlessly (`pi --print ...`).
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
  // Types only for the library entry (the CLI has no public type surface).
  dts: { entry: ["src/index.ts"] },
  sourcemap: true,
  clean: true,
  external: ["@recoder/pi-agent-core", "@recoder/pi-ai", "@recoder/pi-tui", "@mariozechner/clipboard", "@silvia-odwyer/photon-node", "chalk", "cross-spawn", "diff", "glob", "highlight.js", "hosted-git-info", "ignore", "jiti", "minimatch", "proper-lockfile", "semver", "typebox", "undici", "yaml"],
});
