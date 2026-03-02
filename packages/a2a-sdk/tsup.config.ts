import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: [
			"src/index.ts",
			"src/state-mapping.ts",
			"src/error-mapping.ts",
			"src/envelope-builders.ts",
			"src/audit-helpers.ts",
			"src/validation.ts",
		],
		format: ["cjs", "esm"],
		dts: true,
		sourcemap: true,
	},
]);
