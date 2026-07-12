import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		// The package's legacy suites run under `node:test` (see package.json).
		// Scope vitest to the advisory coordination-engine seam it owns.
		include: ["src/advisory/**/*.test.ts"],
	},
});
