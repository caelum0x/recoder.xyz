import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node18",
	// puppeteer is NEVER bundled: it is an OPTIONAL, dynamically-imported driver
	// backend (absent by default). Keeping it external means this engine builds and
	// runs with no puppeteer present and degrades to `not_configured`.
	external: ["puppeteer"],
});
