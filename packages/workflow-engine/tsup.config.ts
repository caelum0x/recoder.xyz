import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node18",
	// The domain packages are degrade-safe siblings; keep them external so this
	// engine never bundles their transitive surface (agent-os types, hook CLI).
	external: ["@recoder/agent-workflows", "@recoder/agent-hooks"],
});
