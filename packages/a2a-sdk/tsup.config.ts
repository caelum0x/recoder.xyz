import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: [
			"src/index.ts",
			"src/schemas/index.ts",
			"src/state-mapping.ts",
			"src/error-mapping.ts",
			"src/envelope-builders.ts",
			"src/audit-helpers.ts",
			"src/bridge-contract.ts",
			"src/agent-profile.ts",
			"src/task-intent.ts",
			"src/policy.ts",
			"src/instruction-bundle.ts",
			"src/validation.ts",
		],
		format: ["cjs", "esm"],
		dts: true,
		sourcemap: true,
	},
]);
