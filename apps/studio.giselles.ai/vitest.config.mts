import { existsSync } from "node:fs";
import { resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import type { Plugin } from "vite";

/**
 * Vite plugin that resolves @giselles-ai/* workspace packages directly
 * to their source entry points when dist/ hasn't been built yet.
 * This lets vitest run without requiring a prior `turbo build` step.
 */
function resolveWorkspacePackages(): Plugin {
	const packagesRoot = resolve(__dirname, "../../packages");
	return {
		name: "resolve-giselles-workspace-packages",
		enforce: "pre",
		resolveId(source) {
			if (!source.startsWith("@giselles-ai/")) return null;
			const pkgName = source.replace("@giselles-ai/", "");
			const srcEntry = resolve(packagesRoot, pkgName, "src/index.ts");
			if (existsSync(srcEntry)) {
				return srcEntry;
			}
			return null;
		},
	};
}

export default defineConfig({
	plugins: [resolveWorkspacePackages(), tsconfigPaths()],
	test: {
		environment: "node",
		setupFiles: ["./vitest.setup.ts"],
		// Exclude E2E tests from Vitest since they are run with Playwright
		exclude: [...configDefaults.exclude, "tests/e2e/**"],
	},
});
