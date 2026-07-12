import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node18",
	// document-preprocessor is dynamically imported and degrade-safe; keep it
	// external so this engine never bundles the pdfium wasm surface.
	external: ["@recoder/document-preprocessor"],
});
